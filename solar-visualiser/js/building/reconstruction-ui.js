window.SolarViz=window.SolarViz||{};
(function(SV){
'use strict';
const data=window.BROOM_RECONSTRUCTION,$=id=>document.getElementById(id),R=SV.reconstruction,E=SV.roofEdit,S=SV.buildingSolid,G=SV.buildingGeometry;
if(!data){$('errors').textContent='Reconstruction bundle is missing. Run reconstruction/run.py first.';return;}
let stage=data.stages.find(s=>s.id===data.recommendedStage)||data.stages[0];
const photos=window.IMAGE_DATA.images,refs=[...stage.photos.map(ph=>photos.find(im=>im.id===ph.imageId)),...photos.filter(im=>!stage.photos.some(ph=>ph.imageId===im.id))];
const rearImage='b3c87cfb9faa2d98b3231da431fae97b',reviewRear=data.reviewFocus==='rear';
let imageId=reviewRear&&refs.some(im=>im.id===rearImage)?rearImage:refs[0].id;
for(const s of data.stages)$('stage').add(new Option(s.label,s.id));$('stage').value=stage.id;
for(const im of refs)$('photo').add(new Option(im.caption+' · '+im.id.slice(0,6)+(stage.photos.some(p=>p.imageId===im.id)?' · '+stage.photos.find(p=>p.imageId===im.id).role:data.rearReview?.photos.some(p=>p.imageId===im.id)?' · rear check':' · reference'),im.id));
$('photo').value=imageId;
const scene=new THREE.Scene();scene.background=new THREE.Color('#17222c');const camera=new THREE.PerspectiveCamera(42,1,.05,500),renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));$('view3d').appendChild(renderer.domElement);
const controls=new THREE.OrbitControls(camera,renderer.domElement);controls.target.set(-3,2,0);camera.position.set(...(reviewRear?[-25,15,-12]:[22,18,19]));controls.update();
scene.add(new THREE.HemisphereLight(0xffffff,0x516277,2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(10,25,15);scene.add(sun);scene.add(new THREE.GridHelper(50,50,0x6c7b83,0x293b49));let group=new THREE.Group();scene.add(group);
function render(){const box=$('view3d').getBoundingClientRect();renderer.setSize(box.width,box.height,false);camera.aspect=box.width/box.height;camera.updateProjectionMatrix();renderer.render(scene,camera);}
controls.addEventListener('change',render);new ResizeObserver(render).observe($('view3d'));
const material=(color,opacity=1)=>new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.85,transparent:opacity<1,opacity});
function line(points,color=0x25303c){const pts=points.map(p=>new THREE.Vector3(...p));pts.push(pts[0]);group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color})));}
function meshRing(ring,color,opacity=1){const positions=[];for(let i=1;i<ring.length-1;i++)positions.push(...ring[0],...ring[i],...ring[i+1]);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();group.add(new THREE.Mesh(geometry,material(color,opacity)));}
function rebuild(){
 group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});group.clear();
 const result=E.validate(stage.worldFaces);$('errors').textContent=result.errors.join(' ');
 const solid=result.solid;if(!solid)return;
 const openings=stage.model.openings.map(o=>({...o,ring:R.world(o.ring,stage.model.parameters)}));
 const view=S.buildSolidMeshes(solid,{roof:material(0x85949c),wall:material(0xb9947c),edge:new THREE.LineBasicMaterial({color:0x253440})});group.add(view.group);
 if($('show-openings').checked){
  for(const wall of solid.wallPanels){
   const holes=[];
   for(const o of openings){
    if(o.ring.some(p=>Math.abs((p[0]-wall.a2[0])*wall.normal[0]+(p[2]-wall.a2[1])*wall.normal[1])>.02))continue;
    const us=o.ring.map(p=>(p[0]-wall.a2[0])*wall.dir[0]+(p[2]-wall.a2[1])*wall.dir[1]),ys=o.ring.map(p=>p[1]);
    if(Math.min(...us)<.01||Math.max(...us)>wall.len-.01||Math.min(...ys)<wall.bottom+.01)continue;
    holes.push({ring:us.map((u,i)=>[u,ys[i]]),u0:Math.min(...us),u1:Math.max(...us),v0:Math.min(...ys),v1:Math.max(...ys)});
   }
   if(holes.length){const mesh=view.wallMeshes.find(m=>m.userData.wallId===wall.id);mesh.geometry.dispose();mesh.geometry=S.wallGeometry(wall,holes);}
  }
  for(const o of openings){if(o.id==='basement-window')continue;meshRing(o.ring,!['photo-fitted','rear-photo-fitted'].includes(o.confidence)?0x9a8bc8:o.kind==='door'?0x9bacae:0x467e91,.86);line(o.ring,0xe9e0d4);}
 }
 // Basement is a separate assumed envelope under the main house only.
 const basement=S.buildSolid(E.stitch(stage.worldFaces.filter(f=>!f.id.startsWith('wing')&&f.id!=='rear-extension')),{groundY:-2.1,preserveVertices:true,snapTol:1e-5,orthogonalize:false});
 for(const w of basement.wallPanels){const wall={...w,topProfile:[[0,0],[w.len,0]],topA:0,topB:0};group.add(new THREE.Mesh(S.wallGeometry(wall,[]),material(0x7b8694,.25)));}
 if($('show-openings').checked){const basementWindow=openings.find(o=>o.id==='basement-window');meshRing(basementWindow.ring,0x467e91,.75);line(basementWindow.ring,0xc1bbc9);}
 // Distinguish the rear roof hypothesis in the 3D preview.
 const ext=stage.worldFaces.find(f=>f.id==='rear-extension');line(ext.ring.map(p=>[p.x,p.y+.015,p.z]),0xc5a2ff);
 if($('show-dsm').checked){
  const dsm=SV.coordinates.decodeDSM(window.__DSM_B64__,window.__DSM_META__),a=SITE_DATA.property_details.geocoded_address,pts=[];
  const polys=stage.worldFaces.map(f=>f.ring.map(p=>[p.x,p.z]));
  for(let r=0;r<dsm.nrows;r++)for(let c=0;c<dsm.ncols;c++){
   const x=dsm.xll+(c+.5)*dsm.cellsize-a.easting,z=a.northing-(dsm.yll+(dsm.nrows-r-.5)*dsm.cellsize),y=dsm.grid[r*dsm.ncols+c]-SITE_DATA.property_details.altitude;
   if(y>0&&y<20&&polys.some(p=>G.pointInPolygon(p,x,z)))pts.push(x,y,z);
  }
  const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));group.add(new THREE.Points(geom,new THREE.PointsMaterial({color:0x4be6dc,size:.07})));
 }
 render();
}
const ns='http://www.w3.org/2000/svg';function svgNode(tag,attrs){const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));$('overlay').appendChild(el);return el;}
function photoView(){
 const im=photos.find(im=>im.id===imageId),ph=stage.photos.find(ph=>ph.imageId===imageId);$('overlay').replaceChildren();
 svgNode('image',{href:SV.imageUrl(im),x:0,y:0,width:1024,height:683,preserveAspectRatio:'xMidYMid meet'});
 const rearReview=[data.rearReview,data.previousRearReview].find(r=>r?.stageId===stage.id),rear=rearReview?.photos.find(p=>p.imageId===imageId);
 if(rear?.overlayEdges){
  if($('show-wire').checked)for(const edge of rear.overlayEdges){const q=R.project(edge.ring,rear.camera);if(q.some(p=>p[2]<=0))continue;const visible=edge.status==='visible';svgNode('line',{x1:q[0][0],y1:q[0][1],x2:q[1][0],y2:q[1][1],stroke:visible?'#ffd166':'#a4b3be','stroke-width':visible?2:1,'stroke-dasharray':visible?'':'5 5',opacity:visible?1:.6});}
  if($('show-observations').checked){
   for(const o of rear.points){const q=o.projectedPx,x=o.pixels[0],y=o.pixels[1];svgNode('line',{x1:x,y1:y,x2:q[0],y2:q[1],stroke:'#ff7474','stroke-width':1.5});const dot=svgNode('circle',{cx:x,cy:y,r:4,fill:o.use==='check'?'#86ffb0':'#35e2e0'});const title=document.createElementNS(ns,'title');title.textContent=o.landmark+' · '+o.use+' · '+o.errorPx.toFixed(1)+' px';dot.appendChild(title);}
   const box=rear.normal.box;svgNode('rect',{x:box[0],y:box[1],width:box[2]-box[0],height:box[3]-box[1],fill:'none',stroke:'#b49bff','stroke-width':1.5});
   for(const edge of rear.checkEdges)svgNode('polyline',{points:edge.pixels.map(p=>p.join(',')).join(' '),fill:'none',stroke:edge.use==='check'?'#86ffb0':'#35e2e0','stroke-width':2});
  }
  $('photo-info').textContent=`REAR EXTENSION · ${rear.status} · fitting points ${rear.poseRmsePx.toFixed(1)} px. ${rear.checkRmsePx===null?'This near view supplies fitting evidence.':`Excluded corner/frame checks: ${rear.checkRmsePx.toFixed(1)} px RMSE.`} Fascia edge ${rear.checkEdges[0].meanDistancePx.toFixed(1)} px (${rear.checkEdges[0].use}); surface direction ${rear.normalErrorDeg.toFixed(1)}° from predicted normals. Gold: visible fitted frame/fascia. Dashed grey: unvalidated or occluded roof context. Upper-wing corners remain unverified; this is a partial exterior check, not metric certification.`;
  return;
 }
 if(rear){
  if($('show-wire').checked){
   for(const face of stage.model.faces.filter(f=>f.id==='wing-mono'||f.id==='rear-extension')){
    const ring=face.ring.map(p=>[p.x,p.y,p.z]),edges=ring.map((p,i)=>[p,ring[(i+1)%ring.length]]);
    for(const p of [ring[1],ring[2]])edges.push([p,[p[0],0,p[2]]]);
    for(const edge of edges){const q=R.project(edge,rear.camera);if(q.some(p=>p[2]<=0))continue;svgNode('line',{x1:q[0][0],y1:q[0][1],x2:q[1][0],y2:q[1][1],stroke:'#ffd166','stroke-width':2});}
   }
  }
  if($('show-observations').checked){
   for(const o of rear.points){const q=R.project([rear.landmarks[o.landmark]],rear.camera)[0],x=o.px[0]*1024,y=o.px[1]*683;
    svgNode('line',{x1:x,y1:y,x2:q[0],y2:q[1],stroke:'#ff7474','stroke-width':1.5});
    const node=svgNode('circle',{cx:x,cy:y,r:5,fill:o.use==='check'?'#86ffb0':'#35e2e0',stroke:'#132630','stroke-width':1});const title=document.createElementNS(ns,'title');title.textContent=o.landmark+' · '+o.use+' · '+o.errorPx.toFixed(1)+' px';node.appendChild(title);
   }
   for(const edge of rear.checkEdges)svgNode('polyline',{points:edge.pixels.map(p=>p.join(',')).join(' '),fill:'none',stroke:'#86ffb0','stroke-width':3});
  }
  $('photo-info').textContent=`${rear.status==='failed-check'?'FAILED REAR CHECK':'Provisional rear alignment'} · pose ${rear.poseRmsePx.toFixed(1)} px; withheld roof corner ${rear.checkRmsePx.toFixed(1)} px; visible eave ${rear.checkEdges[0].meanDistancePx.toFixed(1)} px from projected line. ${rear.boundHits.length?'Camera limit reached: '+rear.boundHits.join(', ')+'. ':''}Green checks did not enter the camera fit. Orange lines include occluded model edges. Review landmark attribution, camera and geometry before accepting this elevation.`;
  if(data.rearGeometryTrial){const t=data.rearGeometryTrial;$('photo-info').textContent+=` A subsequent rear-geometry trial was ${t.status}: held-out far-photo corner ${t.withheldCornerPx.toFixed(1)} px. ${t.reasons.join('; ')}. Trial geometry has not been applied.`;}
  return;
 }
 if(!ph){$('photo-info').textContent=imageId===rearImage?'Reference only: both rear roofs are confirmed as mono-pitch. The corrected candidate uses single slopes; exact pitches and heights remain approximate. This photo’s camera has not been fitted.':'Reference only: no camera or numerical geometry fit for this image yet.';return;}
 if($('show-wire').checked){
  const lm=stage.model.landmarks,edges=[];
  const front=['front_left','bay_root_left','bay_front_left','bay_front_right','bay_root_right','front_right'];
  for(let i=1;i<front.length;i++)edges.push([lm[front[i-1]],lm[front[i]]]);
  for(const k of front)edges.push([lm[k],[lm[k][0],0,lm[k][2]]]);
  // Only front facade edges are compared in the calibrated front views.
  for(const o of stage.model.openings.filter(o=>o.id.startsWith('bay-')||o.id==='front-door'))for(let i=0;i<4;i++)edges.push([o.ring[i],o.ring[(i+1)%4]]);
  for(const edge of edges){const p=R.project(edge,ph.camera);if(p.some(v=>v[2]<=0))continue;svgNode('line',{x1:p[0][0],y1:p[0][1],x2:p[1][0],y2:p[1][1],stroke:'#ffd166','stroke-width':2});}
 }
 if($('show-observations').checked)for(const o of ph.observations){
  const p=R.project([stage.model.landmarks[o.landmark]],ph.camera)[0],xy=[o.px[0]*1024,o.px[1]*683];
  svgNode('line',{x1:xy[0],y1:xy[1],x2:p[0],y2:p[1],stroke:'#ff7474','stroke-width':1.5});
  const node=svgNode('circle',{cx:xy[0],cy:xy[1],r:4,fill:o.use==='check'?'#86ffb0':'#35e2e0',stroke:'#132630','stroke-width':1});const title=document.createElementNS(ns,'title');title.textContent=o.landmark+' · '+o.use;node.appendChild(title);
 }
 $('photo-info').textContent=ph.role==='check'?`Window check: ${ph.rmsePx.toFixed(1)} px RMSE. Camera aligned using roof, door and vertical facade edges; green window annotations were excluded from geometry fitting and this camera solve.`:`Fitting photo: ${ph.rmsePx.toFixed(1)} px RMSE across annotated features. These observations influenced the geometry.`;
}
function aerialView(){
 const svg=$('aerial-overlay');svg.replaceChildren();const im=document.createElementNS(ns,'image');im.setAttribute('href',window.__AERIAL_DATAURL__);im.setAttribute('width','400');im.setAttribute('height','400');svg.appendChild(im);
 const bbox=SITE_DATA.image_bounding_box,frame=E.propertyFrame(SITE_DATA),nw=frame.point([bbox[0],bbox[3],SITE_DATA.property_details.altitude]),se=frame.point([bbox[2],bbox[1],SITE_DATA.property_details.altitude]);
 for(const face of stage.worldFaces){const path=document.createElementNS(ns,'polygon');path.setAttribute('points',face.ring.map(p=>[(p.x-nw.x)/(se.x-nw.x)*400,(p.z-nw.z)/(se.z-nw.z)*400].join(',')).join(' '));path.setAttribute('fill',face.id==='rear-extension'?'#c5a2ff44':'#ffd16622');path.setAttribute('stroke',face.id==='rear-extension'?'#c5a2ff':'#ffd166');path.setAttribute('stroke-width','1');svg.appendChild(path);}
 const os=window.RECONSTRUCTION_WORKFLOW?.os;
 for(const [rings,color,dash] of [[os?.buildingLocal,'#ffffff',''],[os?.siteLocal?.flat(1),'#38e4e1','4 3']])for(const ring of rings||[]){const line=document.createElementNS(ns,'polyline');line.setAttribute('points',ring.map(([x,z])=>[(x-nw.x)/(se.x-nw.x)*400,(z-nw.z)/(se.z-nw.z)*400].join(',')).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',color);line.setAttribute('stroke-width','1.5');line.setAttribute('stroke-dasharray',dash);svg.appendChild(line);}
}
function refresh(){
 const fitting=stage.photos.filter(p=>p.role==='fit'),checking=stage.photos.filter(p=>p.role==='check'),average=a=>a.reduce((s,p)=>s+p.rmsePx,0)/a.length;
 const baselineCheck=average(data.stages[0].photos.filter(p=>p.role==='check'));
 const metrics=[[average(fitting).toFixed(1)+' px','Front fitting-photo mean RMSE'],[average(checking).toFixed(1)+' px','Front window-check mean RMSE']];
 if(stage.id===data.exteriorPass?.stageId){const checked=data.exteriorPass.photos.find(p=>p.checkRmsePx!==null);if(checked)metrics.push([checked.checkRmsePx.toFixed(1)+' px','Rear excluded-point RMSE']);}
 $('summary').replaceChildren();for(const [value,label] of metrics){const el=document.createElement('div');el.className='metric';const strong=document.createElement('strong');strong.textContent=value;const span=document.createElement('span');span.textContent=label;el.append(strong,span);$('summary').appendChild(el);}
 if(average(checking)>baselineCheck){const warning=document.createElement('p');warning.className='badge';warning.textContent='Check images got worse than the initial hypothesis. Review alignment and geometry.';$('summary').appendChild(warning);}
 if(stage.id===data.rearReview?.stageId){const warning=document.createElement('p');warning.className='badge';warning.textContent=data.rearReview.status==='partial-diagnostic-pass'?'Visible rear extension checks pass. Upper rear wing remains unverified.':'Rear validation: '+data.rearReview.status+'. Front residuals do not establish rear accuracy.';$('summary').appendChild(warning);}
 $('parameter-table').replaceChildren();for(const [k,v] of Object.entries(stage.model.parameters)){const tr=document.createElement('tr');for(const val of [k.replaceAll('_',' '),data.stages[0].model.parameters[k]?.toFixed(2)||'—',v.toFixed(2)]){const td=document.createElement('td');td.textContent=val;tr.appendChild(td);}tr.title=data.parameterDefinitions[k].source;$('parameter-table').appendChild(tr);}
 $('dsm-table').replaceChildren();for(const d of stage.dsm){const tr=document.createElement('tr');for(const val of [d.faceId,d.samples+' samples',d.medianAbsM.toFixed(2)+' m median']){const td=document.createElement('td');td.textContent=val;tr.appendChild(td);}$('dsm-table').appendChild(tr);}
 photoView();aerialView();rebuild();
}
$('stage').onchange=()=>{stage=data.stages.find(s=>s.id===$('stage').value);refresh();};$('photo').onchange=()=>{imageId=$('photo').value;photoView();};['show-observations','show-wire'].forEach(id=>$(id).onchange=photoView);['show-openings','show-dsm'].forEach(id=>$(id).onchange=rebuild);
for(const [id,pos] of [['front',[22,18,19]],['rear',[-25,15,-12]],['above',[-3,32,.01]]])$(id).onclick=()=>{camera.position.set(...pos);controls.update();render();};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({schemaVersion:1,propertyId:data.propertyId,kind:'reconstruction-candidate',stage,provenance:data.provenance},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='3broomroad-reconstruction-'+stage.id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
for(const text of data.provenance.limitations){const li=document.createElement('li');li.textContent=text;$('limits').appendChild(li);}
$('plan').src=SV.imageUrl(window.IMAGE_DATA.floorplan);for(const d of data.evidence.plan.dimensions){const tr=document.createElement('tr');for(const value of [d.room,d.width.toFixed(2)+' × '+d.depth.toFixed(2)+' m',d.note||'']){const td=document.createElement('td');td.textContent=value;tr.appendChild(td);}$('plan-dimensions').appendChild(tr);}
window.__BROOM_RECONSTRUCTION__={get stage(){return stage;},data,scene,camera,renderer};refresh();
})(window.SolarViz);
