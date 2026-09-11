window.SolarViz.setupGeometryPrep=function({building}){
  const SV=window.SolarViz,P=SV.geometryPrep,H=SV.heatLoss,O=SV.buildingOpenings;
  const workflow=window.RECONSTRUCTION_WORKFLOW?.propertyId===SV.currentProperty.id?window.RECONSTRUCTION_WORKFLOW:null;
  let dialog=null,geometry=null,selected=null,tab='rooms',focusedTask=null,feedback='';
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const id=()=>crypto.randomUUID(),now=()=>new Date().toISOString();
  function derive(){
    const windows=building.state.windows.flatMap(w=>{const r=O.windowRect(w,building.solid,building.levels);return r?[{id:w.id,kind:w.kind||'window',ring:r.ring.map(([u,y])=>[r.wall.a2[0]+r.wall.dir[0]*u,y,r.wall.a2[1]+r.wall.dir[1]*u])}]:[];});
    const geo=H.derive({solid:building.solid,levels:building.levels,roomsByLevel:building.roomsByLevel,windows,origin:building.origin});
    const report=window.BROOM_RECONSTRUCTION,stage=report?.stages?.find(s=>s.id===building.state.geometrySource?.stageId);
    return P.boundaryHypotheses(geo,stage?.model.parameters,building.state.geometrySource?.propertyId);
  }
  function state(){return building.state.geometryPrep ||= P.empty(SV.currentProperty.id,geometry.signature);}
  function store(next){building.state.geometryPrep=next;building.save();render();}
  function button(parent,label,key,run){const b=el('button',label);if(key)b.id=key;b.onclick=()=>{try{run();}catch(e){feedback=e.message;render();}};parent.appendChild(b);return b;}
  function field(parent,label,value,onchange,{type='number',min=.001}={}){
    const wrap=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value??'';if(type==='number'){input.min=min;input.step='any';}
    input.onchange=()=>{if(!input.checkValidity()){input.reportValidity();return;}onchange(type==='number'?(input.value===''?null:Number(input.value)):input.value);building.save();render();};wrap.appendChild(input);parent.appendChild(wrap);return input;
  }
  function select(parent,label,value,options,onchange){const wrap=el('label',label),input=el('select');for(const [v,text] of options){const o=el('option',text);o.value=v;input.appendChild(o);}input.value=value||'';input.onchange=()=>{onchange(input.value);building.save();render();};wrap.appendChild(input);parent.appendChild(wrap);return input;}
  const linkedPlan=(room,input)=>Object.hasOwn(input,'planRoomId')?input.planRoomId:room.sourceRoomId||null;
  const planTaken=(planId,roomId,st)=>geometry.rooms.some(r=>r.id!==roomId&&linkedPlan(r,st.rooms[r.id]||{})===planId);
  const names={unknown:'Unknown',external:'External / outside',party:'Party wall / adjoining dwelling',ground:'Ground contact',unheated:'Unheated space',internal:'Internal / adjacent room'};
  function coverage(){
    const broom=building.state.geometrySource&&SV.currentProperty.id==='3broomroad',items=[];
    if(broom){
      items.push({id:'basement',rank:10000,priority:'critical',title:building.lowerSolid?'Validate provisional basement depth, extent and exposed walls.':'Confirm basement extent and exposed walls; this level is absent from the 3D model.',why:'A missing heated level or incorrect ground-contact boundary changes the envelope.',method:'The lower ground is normally heated living space. Measure a representative clear height and key outline dimensions. Mark exposed/below-ground walls and the basement window on the plan.'});
      items.push({id:'terrace-boundaries',rank:9200,priority:'high',title:'Confirm party-wall runs; DSM gaps do not establish an external wall.',why:'OS describes a mid-terrace house with two connections. The exact shared and exposed lengths still need review.',method:'Mark each adjoining dwelling and any exposed rear returns on the plan. Confirm uncertain boundaries on site and record the extent, not just one whole-house wall type.'});
      items.push({id:'rear-extent',rank:8800,priority:'high',title:'Resolve the upper rear wing / OS-plan footprint disagreement.',why:'The upper wing extent is still inferred; errors affect several rooms and walls.',method:'Confirm which walls belong to this house, take one reliable wing width and length, and photograph the roof/wall junctions. Use a common height datum.'});
    }
    for(const o of building.state.unboundCandidateOpenings||[]){if(broom&&(o.sourceId||o.id)==='basement-window')continue;items.push({id:'opening:'+(o.sourceId||o.id),rank:750,priority:'normal',title:'Locate and size unassigned opening: '+(o.sourceId||o.id),why:o.reason,method:'Locate the opening on the room/roof plan and measure its area; record a reference photo. Complete major boundary and missing-space checks first.'});}
    return items;
  }

  function download(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function close(){dialog.close();dialog.remove();dialog=null;}
  function planSketch(parent,room,surfaces,highlight){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),poly=room.poly;
    svg.setAttribute('viewBox','0 0 360 220');svg.classList.add('gp-plan');
    const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),scale=Math.min(320/(Math.max(...xs)-x||1),180/(Math.max(...ys)-y||1));
    const xy=p=>[20+(p[0]-x)*scale,20+(p[1]-y)*scale],colors={unknown:'#e5b85c',external:'#5eb6ee',party:'#bd8cf5',internal:'#78989a',ground:'#a98b62',unheated:'#ec9273'};
    const shape=document.createElementNS(svg.namespaceURI,'polygon');shape.setAttribute('points',poly.map(p=>xy(p).join(',')).join(' '));shape.setAttribute('fill','#223746');svg.appendChild(shape);
    for(const s of surfaces.filter(s=>s.edge)){
      const line=document.createElementNS(svg.namespaceURI,'polyline');line.setAttribute('points',s.edge.map(p=>xy(p).join(',')).join(' '));line.setAttribute('stroke',colors[s.current.boundary]);line.setAttribute('stroke-width',s.id===highlight?7:4);line.setAttribute('fill','none');line.style.cursor='pointer';const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=names[s.current.boundary]+' · '+s.current.grossArea.toFixed(1)+' m²';line.appendChild(title);line.onclick=()=>{const c=dialog.querySelector('[data-surface-id="'+s.id+'"]');if(c){for(let p=c;p&&p!==dialog;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;c.scrollIntoView({block:'center'});}};svg.appendChild(line);
    }parent.appendChild(svg);
  }
  function renderRooms(parent,st,result){
    if(!result.rooms.some(r=>r.id===selected))selected=result.rooms[0]?.id;
    const layout=el('div',undefined,'hl-layout'),nav=el('nav'),detail=el('section');parent.appendChild(layout);layout.append(nav,detail);
    for(const r of result.rooms){const b=button(nav,r.name+' · '+r.current.area.toFixed(1)+' m²',null,()=>{selected=r.id;render();});b.dataset.roomId=r.id;b.className=selected===r.id?'selected':'';nav.appendChild(el('small',r.current.volume.toFixed(1)+' m³ · '+(r.checked.length?'partly site-checked':'remote estimate')));}
    if(!selected)return;const room=result.rooms.find(r=>r.id===selected),input=st.rooms[room.id] ||= {},surfaces=result.surfaces.filter(s=>s.roomA===room.id||s.roomB===room.id);
    button(detail,'Edit this floor’s rooms','gp-edit-floor',()=>{close();building.selectFloor(room.levelIdx);document.getElementById('bm-wall-btn').scrollIntoView({block:'center'});});
    detail.appendChild(el('p','Blue = external · purple = party · amber = unknown · grey = internal. Click a wall segment to classify it.','hl-note'));
    planSketch(detail,room,surfaces);
    detail.appendChild(el('p',`Remote → current: ${room.remote.area.toFixed(1)} → ${room.current.area.toFixed(1)} m²; ${room.remote.height.toFixed(2)} → ${room.current.height.toFixed(2)} m mean height; ${room.remote.volume.toFixed(1)} → ${room.current.volume.toFixed(1)} m³.`,'hl-result'));
    detail.appendChild(el('p','Dimensions below are remote estimates. Shell-derived dimensions include construction thickness and overhangs. Length/width are maximum spans, not a rectangular area formula. Site changes update the quantity schedule; move walls in the geometry editor to reconcile the 3D shape.','hl-note'));
    const fields=el('div',undefined,'hl-fields');detail.appendChild(fields);
    field(fields,'Room name',room.name,v=>building.renameRoom(room.levelIdx,room.localId,v||room.name),{type:'text'});
    for(const [key,label] of [['length','Maximum length (m)'],['width','Maximum width (m)'],['area','Internal floor area estimate (m²)'],['height','Mean clear height estimate (m)'],['volume','Air volume estimate (m³)']])field(fields,label,input[key],v=>input[key]=v).placeholder=room.remote[key].toFixed(2)+' from geometry';
    select(fields,'Heated status',input.heatedStatus||'unknown',[['unknown','Unknown'],['heated','Heated'],['unheated','Unheated']],v=>input.heatedStatus=v);
    select(fields,'Remote confidence',input.confidence||'low',[['low','Low'],['medium','Medium'],['high','High']],v=>input.confidence=v);
    field(fields,'Working uncertainty (%)',input.uncertaintyPct??20,v=>input.uncertaintyPct=v,{min:1});
    field(fields,'Source / assumptions',input.source||'',v=>input.source=v,{type:'textarea'});
    detail.appendChild(el('p','Uncertainty is an editable planning allowance, not a statistical confidence interval. Clear height means an area-weighted average for a sloping ceiling.','hl-note'));
    if(workflow){
      const candidates=P.planEstimates(workflow).filter(p=>p.level===(building.levels[room.levelIdx]?.kind==='lower-ground'?'lower-ground':['ground','first'][room.levelIdx]));
      select(detail,'Link a listing-plan room',linkedPlan(room,input)||'',[['','Not linked'],...candidates.map(p=>[p.id,p.name])],v=>{if(v&&planTaken(v,room.id,st)){feedback='That listing-plan room is already linked to another model room.';return;}input.planRoomId=v||null;});
      button(detail,'Use linked plan estimate','gp-use-plan',()=>{const plan=candidates.find(p=>p.id===(linkedPlan(room,input)));if(!plan)throw Error('Choose a plan room first.');if(planTaken(plan.id,room.id,st))throw Error('That plan room is already linked.');input.planRoomId=plan.id;input.area=plan.estimate.area;input.height=plan.estimate.height;input.volume=null;input.source=plan.estimate.source;input.confidence='low';building.renameRoom(room.levelIdx,room.localId,plan.name);building.save();render();});
    }
    detail.appendChild(el('h3','Room boundary schedule'));
    for(const run of P.surfaceRuns(surfaces)){
      let parent=detail;
      if(run.length>1){
        const group=el('details',undefined,'gp-wall-run'),classes=[...new Set(run.map(s=>s.current.boundary))];
        group.dataset.surfaceId='run:'+run[0].id;
        group.appendChild(el('summary',`${classes.length===1?names[classes[0]]:'Mixed boundary types'} · wall run · ${run.reduce((n,s)=>n+s.current.grossArea,0).toFixed(1)} m²`));
        group.appendChild(el('p','Classify the whole run when the same space is beyond it; use individual segments below where adjacency changes.','hl-note'));
        if(!run[0].roomB){
          select(group,'Boundary type',classes.length===1?classes[0]:'unknown',P.BOUNDARIES.map(v=>[v,names[v]]),v=>run.forEach(s=>{(st.surfaces[s.id] ||= {}).boundary=v;}));
          field(group,'Boundary evidence',new Set(run.map(s=>st.surfaces[s.id]?.source||'')).size===1?(st.surfaces[run[0].id]?.source||''):'',v=>run.forEach(s=>{(st.surfaces[s.id] ||= {}).source=v;}),{type:'text'});
        }
        const advanced=el('details');advanced.dataset.surfaceId='segments:'+run[0].id;advanced.appendChild(el('summary','Individual segments ('+run.length+')'));group.appendChild(advanced);detail.appendChild(group);parent=advanced;
      }
      for(const surface of run){
      const data=st.surfaces[surface.id] ||= {},card=el('details',undefined,'hl-surface');card.dataset.surfaceId=surface.id;
      card.appendChild(el('summary',`${names[surface.current.boundary]} · ${surface.kind} · ${surface.current.grossArea.toFixed(1)} m²${surface.checked.includes('boundary')?' · site-checked':''}`));
      const f=el('div',undefined,'hl-fields');card.appendChild(f);
      if(surface.roomB){const other=result.rooms.find(r=>r.id===(surface.roomA===room.id?surface.roomB:surface.roomA));f.appendChild(el('p','Adjacent room: '+other.name+'. Shared adjacency comes from the room layout. Confirm both rooms’ heated status.'));}
      else select(f,'Boundary type',data.boundary||'unknown',P.BOUNDARIES.map(v=>[v,names[v]]),v=>data.boundary=v);
      field(f,'Gross surface area estimate (m²)',data.grossArea,v=>data.grossArea=v).placeholder=surface.remote.grossArea.toFixed(2);
      field(f,'Total opening area estimate (m²)',data.openingArea,v=>data.openingArea=v,{min:0}).placeholder=surface.remote.openingArea.toFixed(2);
      select(f,'Boundary confidence',data.confidence||'low',[['low','Low'],['medium','Medium'],['high','High']],v=>data.confidence=v);
      field(f,'Boundary evidence',data.source||'',v=>data.source=v,{type:'text'});
      card.appendChild(el('p',`${surface.current.grossArea.toFixed(2)} m² gross − ${surface.current.openingArea.toFixed(2)} m² openings = ${surface.netArea.toFixed(2)} m² opaque. ${surface.source}`));
      if(surface.edge)planSketch(card,room,surfaces,surface.id);
      button(card,'Record a site check',null,()=>{focusedTask={targetKind:'surface',targetId:surface.id,field:surface.roomB?'grossArea':'boundary'};tab='survey';render();});parent.appendChild(card);
      }
    }
  }
  function renderPlan(parent){
    parent.appendChild(el('p','Listing-plan inventory and independent area estimates. In the main viewer, select a floor → Import rooms from floorplan → review alignment → Apply. The imported partitions keep their source room links. Add provisional lower ground in Floors to include the basement; confirm its depth and ground contact on site.','hl-note'));
    const rows=P.planEstimates(workflow),table=el('table');table.className='gp-table';const head=el('tr');['Room','Level','Printed maximum dimensions','Plan area estimate','Volume at assumed 2.6 m'].forEach(t=>head.appendChild(el('th',t)));table.appendChild(head);
    for(const r of rows){const tr=el('tr');[r.name,r.level,r.printedMaxDimensionsM?.join(' × ')+' m',r.estimate.area?.toFixed(1)+' m²',r.estimate.volume?.toFixed(1)+' m³'].forEach((t,i)=>tr.appendChild(el('td',i===2&&!r.printedMaxDimensionsM?'Unprinted':t)));table.appendChild(tr);}parent.appendChild(table);
    parent.appendChild(el('p','Areas use the traced room polygon with a median scale from printed dimensions on that floor. Maximum dimensions are not multiplied into a rectangular area. Check plan scale, recesses and ceiling heights on site.','hl-note'));
    const img=el('img');img.src=SV.imageUrl(window.IMAGE_DATA.floorplan);img.alt='Listing floorplan reference';img.style.maxWidth='100%';parent.appendChild(img);
  }
  function renderSurvey(parent,st,result){
    const tasks=P.priorities(geometry,st,coverage()),top=el('section');parent.appendChild(top);
    top.appendChild(el('h3','First checks on site'));
    top.appendChild(el('p','Prioritised by missing coverage, boundary ambiguity and size × working uncertainty. This is a geometry triage list, not a heat-loss sensitivity calculation.','hl-note'));
    function taskRow(task){const box=el('div',undefined,'gp-task');box.append(el('strong',task.title),el('p',task.why),el('p',task.method));if(task.targetId)button(box,'Record this check',null,()=>{focusedTask=task;render();document.getElementById('gp-survey-form').scrollIntoView({block:'center'});});else if(workflow){const link=el('a','Open evidence / survey record');link.href='survey.html';box.appendChild(link);}return box;}
    tasks.slice(0,6).forEach(t=>top.appendChild(taskRow(t)));
    const rest=el('details');rest.appendChild(el('summary',`Remaining checks (${Math.max(0,tasks.length-6)})`));tasks.slice(6).forEach(t=>rest.appendChild(taskRow(t)));parent.appendChild(rest);
    if(!result.activeRevision){parent.appendChild(el('p','Save a remote snapshot above before recording site checks. Changed remote inputs require a new snapshot; earlier evidence stays in the history.','hl-warning'));}
    else{
      const form=el('form');form.id='gp-survey-form';form.appendChild(el('h3','Record an observation'));
      const targets=[...result.rooms.map(r=>['room|'+r.id,r.name]),...result.surfaces.map(s=>['surface|'+s.id,(result.rooms.find(r=>r.id===s.roomA)?.name||'Room')+' · '+s.kind+' · '+s.current.grossArea.toFixed(1)+' m²'])];
      const chosen=focusedTask||{targetKind:'room',targetId:result.rooms[0]?.id,field:'area'};
      const targetSelect=select(form,'Survey target',chosen.targetKind+'|'+chosen.targetId,targets,v=>{const [targetKind,targetId]=v.split('|');focusedTask={targetKind,targetId,field:targetKind==='room'?'area':'boundary'};});targetSelect.id='gp-target';
      const target=chosen.targetKind==='room'?result.rooms.find(r=>r.id===chosen.targetId):result.surfaces.find(s=>s.id===chosen.targetId);
      const keys=chosen.targetKind==='room'?['length','width','area','height','volume','heatedStatus']:(target?.roomB?['grossArea','openingArea']:['boundary','grossArea','openingArea']);
      const key=keys.includes(chosen.field)?chosen.field:keys[0],labels={length:'Maximum length (m)',width:'Maximum width (m)',area:'Internal floor area (m²)',height:'Mean clear height (m)',volume:'Air volume (m³)',heatedStatus:'Heated status',boundary:'Boundary type',grossArea:'Gross surface area (m²)',openingArea:'Total opening area (m²)'};
      select(form,'Measured field',key,keys.map(k=>[k,labels[k]]),v=>{focusedTask={...chosen,field:v};}).id='gp-field';
      form.appendChild(el('p','Remote value: '+(target?.remote[key]??'unknown')+' · current: '+(target?.current[key]??'unknown')));
      const value=el(key==='boundary'||key==='heatedStatus'?'select':'input');value.id='gp-value';
      if(value.tagName==='SELECT'){const opts=key==='boundary'?P.BOUNDARIES:['unknown','heated','unheated'];opts.forEach(v=>{const o=el('option',names[v]||v);o.value=v;value.appendChild(o);});}else{value.type='number';value.step='any';value.min=key==='openingArea'?0:.001;}form.appendChild(value);
      // Do not rerender while typing an observation: the draft remains intact until submission.
      const input=(name,label,type='text')=>{const wrap=el('label',label),n=el('input');n.id=name;n.type=type;n.required=true;wrap.appendChild(n);form.appendChild(wrap);return n;};
      const observer=input('gp-observer','Observer'),method=input('gp-method','Method (e.g. laser + sketch)'),reference=input('gp-reference','Evidence reference (photo / sketch / survey ID)');
      const status=el('select');status.id='gp-status';[['measured','Measured / observed'],['not-accessible','Not accessible — retain uncertainty']].forEach(([v,t])=>{const o=el('option',t);o.value=v;status.appendChild(o);});form.appendChild(status);
      const note=input('gp-note','Notes / uncertainty');note.required=false;
      const applyRun=el('input');applyRun.type='checkbox';applyRun.id='gp-apply-run';if(chosen.targetIds?.length>1&&key==='boundary'){const wrap=el('label','Same classification applies to all '+chosen.targetIds.length+' segments of this wall run');wrap.appendChild(applyRun);form.appendChild(wrap);}
      const submit=el('button','Save observation');submit.type='submit';submit.id='gp-record';form.appendChild(submit);
      form.onsubmit=e=>{e.preventDefault();try{const event={id:id(),revisionId:result.activeRevision,geometrySignature:geometry.signature,targetKind:chosen.targetKind,targetId:chosen.targetId,targetName:chosen.targetKind==='room'?target.name:(result.rooms.find(r=>r.id===target.roomA)?.name||'Room')+' · '+target.kind,field:key,value:status.value==='not-accessible'?null:value.tagName==='SELECT'?value.value:value.value===''?null:Number(value.value),status:status.value,observer:observer.value,method:method.value,evidenceRef:reference.value,note:note.value,recordedAt:now(),remoteValue:target.remote[key]};const targetIds=applyRun.checked?chosen.targetIds:[chosen.targetId],groupId=id();let next=st;for(const targetId of targetIds)next=P.append(next,geometry,{...event,id:id(),groupId,targetId});store(next);}catch(err){feedback=err.message;const message=el('p',feedback,'hl-warning');form.appendChild(message);}};parent.appendChild(form);
    }
    parent.appendChild(el('h3','Observation history — review before applying'));
    const shownGroups=new Set();
    for(const e of [...st.events].reverse()){
      const peers=e.groupId?st.events.filter(v=>v.groupId===e.groupId):[e];
      const isRun=peers.length>1&&e.field==='boundary'&&peers.every(v=>v.targetKind==='surface'&&v.field===e.field&&v.value===e.value&&v.status===e.status&&v.observer===e.observer&&v.method===e.method&&v.evidenceRef===e.evidenceRef&&v.revisionId===e.revisionId)&&P.surfaceRuns(result.surfaces).some(run=>peers.every(v=>run.some(s=>s.id===v.targetId)));
      if(isRun&&shownGroups.has(e.groupId))continue;if(isRun)shownGroups.add(e.groupId);const group=isRun?peers:[e];
      const decision=st.decisions.filter(d=>d.eventId===e.id).at(-1),current=e.revisionId===result.activeRevision&&e.geometrySignature===geometry.signature;
      const box=el('article',undefined,'gp-task');box.append(el('strong',`${e.targetName||e.targetId} · ${e.field}: ${e.remoteValue??'unknown'} → ${e.value??'not accessible'}`),el('p',`${e.observer} · ${e.method} · ${e.evidenceRef} · ${e.recordedAt}`),el('p',(group.length>1?'Wall run: '+group.length+' segments. ':'')+(e.note||'')),el('p',current?(decision?.action||'Awaiting review'):'Earlier revision — retained; recheck against current geometry'));
      if(current&&e.status==='measured'){button(box,'Accept correction',null,()=>store(group.reduce((next,event)=>P.decide(next,geometry,event.id,'accept',now()),st))).dataset.acceptEvent=e.id;button(box,'Reject this correction',null,()=>store(group.reduce((next,event)=>P.decide(next,geometry,event.id,'reject',now()),st)));}parent.appendChild(box);
    }
  }
  function render(){
    if(!dialog)return;geometry=derive();const st=state(),result=P.review(geometry,st),scroll=dialog.scrollTop,openIds=[...dialog.querySelectorAll('details[open][data-surface-id]')].map(n=>n.dataset.surfaceId);
    dialog.replaceChildren();const head=el('header'),title=el('div');title.append(el('h2','Rooms & building envelope'),el('p','Remote estimates → targeted site checks → reviewed corrections'));head.appendChild(title);
    button(head,'Export geometry review','gp-export',()=>download('geometry-review-'+SV.currentProperty.id+'.json',{kind:'geometry-review',schemaVersion:1,propertyId:SV.currentProperty.id,geometry,review:result,prep:st,priorityChecks:P.priorities(geometry,st,coverage()),coverage:coverage()}));
    button(head,'Import observations','gp-import',()=>document.getElementById('gp-import-file').click());button(head,'Close','gp-close',close);dialog.appendChild(head);
    const upload=el('input');upload.type='file';upload.accept='.json';upload.id='gp-import-file';upload.hidden=true;upload.onchange=async()=>{try{const packet=JSON.parse(await upload.files[0].text());if(packet.kind!=='geometry-review'||packet.propertyId!==SV.currentProperty.id)throw Error('Wrong property / review format.');store(P.merge(st,packet.prep,SV.currentProperty.id));}catch(e){feedback=e.message;render();}};dialog.appendChild(upload);
    const summary=el('p',`${result.stage==='site-refined'?'Site-refined quantities':'Remote geometry draft'} · ${result.rooms.length} model rooms · ${P.surfaceRuns(result.surfaces).filter(run=>run.some(s=>s.current.boundary==='unknown')).length} unclassified surfaces / wall runs · ${result.acceptedFields} accepted site observations. Individual unchecked fields remain remote estimates.`,'hl-result');summary.id='gp-summary';dialog.appendChild(summary);
    const active=st.revisions.find(r=>r.id===result.activeRevision);dialog.appendChild(el('p',st.revisions.length+' saved remote snapshot(s). '+(active?'Active snapshot: '+new Date(active.recordedAt).toLocaleString():'Current draft has no matching saved snapshot.'),'hl-note'));
    if(feedback)dialog.appendChild(el('p',feedback,'hl-warning'));
    const actions=el('div');dialog.appendChild(actions);
    if(result.stale){dialog.appendChild(el('p','Geometry changed. Earlier assignments and observations are retained but are not applied to this revision.','hl-warning'));button(actions,'Start draft for changed geometry','gp-rebase',()=>store(P.rebase(st,geometry)));}
    else{
      button(actions,'Use geometry-based boundary guesses','gp-suggest',()=>store(P.suggestions(geometry,st)));
      button(actions,result.activeRevision?'Remote snapshot saved':'Save remote snapshot for survey','gp-checkpoint',()=>{store(P.checkpoint(st,geometry,building.state,id(),now()));}).disabled=!!result.activeRevision;
    }
    if(result.issues.length)dialog.appendChild(el('p',result.issues.join('; '),'hl-warning'));
    const nav=el('div',undefined,'gp-tabs');[['rooms','Rooms & boundaries'],...(workflow?[['plan','Listing-plan estimates']]:[]),['survey','Priority site checks']].forEach(([key,label])=>{const b=button(nav,label,'gp-tab-'+key,()=>{tab=key;render();});b.className=tab===key?'selected':'';});dialog.appendChild(nav);
    const content=el('div');dialog.appendChild(content);
    if(result.stale&&tab==='rooms')content.appendChild(el('p','Start a new draft above before editing the current room schedule.'));
    else if(tab==='rooms')renderRooms(content,st,result);else if(tab==='plan')renderPlan(content);else renderSurvey(content,st,result);
    for(const key of openIds){const n=dialog.querySelector('[data-surface-id="'+key+'"]');if(n)n.open=true;}
    dialog.scrollTop=scroll;
  }
  document.getElementById('bm-geometry-prep').onclick=()=>{if(dialog)return;tab='rooms';focusedTask=null;dialog=el('dialog',undefined,'ashp-dialog heat-loss-dialog geometry-prep-dialog');dialog.id='geometry-prep-dialog';dialog.setAttribute('aria-label','Rooms and building envelope');document.body.appendChild(dialog);dialog.addEventListener('cancel',()=>{dialog.remove();dialog=null;});render();dialog.showModal();};
  return {derive};
};
