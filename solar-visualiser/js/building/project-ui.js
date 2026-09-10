window.SolarViz.setupProject=function({building}){
 const SV=window.SolarViz,B=SV.buildingProject,box=document.getElementById('bm-project'),report=window.BROOM_RECONSTRUCTION;
 let problem='';
 function mapRooms(){try{const prepared=SV.automaticRooms.prepare(building.state,report,window.RECONSTRUCTION_WORKFLOW,building.roofBase,building.origin);if(prepared.changed)building.replaceWorkingState(prepared.state);}catch(e){problem='Automatic room mapping needs review: '+e.message;}}
 function button(parent,id,label,run){const b=document.createElement('button');b.id=id;b.className='btn';b.textContent=label;b.onclick=run;parent.appendChild(b);return b;}
 function render(){
  box.replaceChildren();const source=building.state.geometrySource,rooms=Object.values(building.roomsByLevel).flat(),note=document.createElement('p');note.className='workspace-status';note.textContent=source?`${building.levels.length} floors · ${rooms.length} spaces · Remote model`:'Survey geometry';box.appendChild(note);
  const mapping=building.state.automaticRooms,stale=mapping&&mapping.sourceGeometry!==SV.automaticRooms.sourceKey(building.state,building.roofBase),summary=document.getElementById('bm-auto-summary');summary.textContent=problem||(stale?'Geometry changed since mapping. Room layouts retained; review their fit.':mapping?.status==='needs-review'?'Some rooms need attention. Open mapping details below.':mapping?(mapping.records.some(r=>r.status==='preserved')?'Existing layouts retained; missing rooms mapped from the plan. Dimensions remain estimates.':'Rooms mapped from the listing plan. Dimensions remain estimates.'):'Select a floor to inspect its rooms.');
  if(problem||mapping?.status==='needs-review')note.textContent+=' · Room mapping needs review';
  const info=document.getElementById('bm-mapping-details');info.replaceChildren();
  for(const row of mapping?.records||[]){const p=document.createElement('p');p.textContent=(building.levels[row.level]?.name||'Floor '+row.level)+': '+(row.status==='mapped'?`${row.rooms} rooms mapped; largest plan outline offset ${row.maxOutlineOffsetM.toFixed(2)} m.`:row.reason);info.appendChild(p);}
  if(mapping){const p=document.createElement('p');p.textContent='Room shapes, basement depth, wall thickness and stair voids remain remote hypotheses. Rear extent and party walls need survey checks.';info.appendChild(p);}
  if(report&&report.propertyId===SV.currentProperty.id){
   if(!source){const edited=SV.roofEdit.changed(building.state.roofEdits)||building.state.footprintOffsets||building.state.windows.length||Object.values(building.state.floors).some(f=>f.dividers?.length||Object.keys(f.roomNames||{}).length);button(box,'bm-adopt-reconstruction','Build house & rooms'+(edited?'…':''),edited?preview:adopt);}
   else {const versions=document.createElement('details'),label=document.createElement('summary');label.textContent='Model versions';versions.appendChild(label);button(versions,'bm-adopt-reconstruction','Rebuild from evidence…',preview);if(building.state.reconstructionBackup)button(versions,'bm-restore-reconstruction','Restore previous model',()=>building.replaceWorkingState(JSON.parse(JSON.stringify(building.state.reconstructionBackup))));box.appendChild(versions);}
  }
 }
 function adopt(){try{let next=B.adopt(building.state,report,building.roofBase,SV.currentProperty.id);next=SV.automaticRooms.prepare(next,report,window.RECONSTRUCTION_WORKFLOW,building.roofBase,building.origin).state;building.replaceWorkingState(next);problem='';render();}catch(e){problem=e.message;render();}}
 function preview(){const el=document.createElement('dialog');el.className='ashp-dialog';const h=document.createElement('h2');h.textContent='Rebuild house and rooms?';const p=document.createElement('p');p.textContent='This replaces the working geometry and room edits with the reconstructed exterior and automatically mapped plans. A copy of the current model is retained; survey history stays available.';el.append(h,p);button(el,'bm-confirm-adopt','Rebuild',()=>{adopt();el.close();el.remove();});button(el,'bm-cancel-adopt','Cancel',()=>{el.close();el.remove();});document.body.appendChild(el);el.showModal();el.addEventListener('cancel',()=>el.remove());}
 // The user has authorised automatic plan mapping. Fill empty layouts on existing
 // reconstructed models once; a reload never overwrites edited or cleared rooms.
 mapRooms();building.addRebuildListener(render);building.addLayoutListener(render);render();
};
