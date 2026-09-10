// Aerial-plan roof editor with a disposable 3D preview. Drafts remain local to
// the dialog until Apply; only user corrections enter buildingState.
window.SolarViz = window.SolarViz || {};
window.SolarViz.setupRoofEditor = function ({building,siteData,planDraw,dsm}) {
  const E=window.SolarViz.roofEdit,G=window.SolarViz.buildingGeometry,D=window.SolarViz.roofDSM;
  let dialog=null;
  const button=document.getElementById('bm-roof-edit');
  const newId=()=> 'manual-'+crypto.randomUUID();
  button.addEventListener('click',open);
  function open() {
    if(dialog) return;
    if(planDraw.isActive()) planDraw.cancel();
    building.prepareRoofEdit();
    let faces=building.getRoofFaces(),selected=faces[0].id,corner=0,drawing=null,splitFrom=null,drag=null;
    let undo=[],redo=[],guidedFaces=new Set();
    const el=document.createElement('div');el.className='roof-editor';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Edit roof geometry');
    el.innerHTML=`
      <div class="re-head"><div><strong>Edit roof geometry</strong><small>Trace the aerial, check heights against photos, then apply.</small></div><button id="re-undo">Undo</button><button id="re-redo">Redo</button><button id="re-cancel">Cancel</button><button id="re-apply" class="re-primary">Apply roof changes</button></div>
      <div class="re-body"><div class="re-workspace">
        <div class="re-toolbar"><button id="re-add">+ Draw roof face</button><button id="re-redraw">Redraw selected</button><button id="re-finish" hidden>Finish outline</button><button id="re-stop" hidden>Cancel drawing</button><button id="re-fit">Fit view</button><label><input id="re-snap" type="checkbox" checked> Snap corners</label><label><input id="re-grid" type="checkbox" checked> 1 m grid</label></div>
        <svg id="re-plan" aria-label="Aerial roof plan. Click a face, drag its numbered corners. Scroll to zoom; shift-drag to pan." tabindex="0"></svg>
        <div id="re-hint">Click a face to select it. Drag numbered corners; shift-drag to pan, scroll to zoom. North is up.</div>
        <div class="re-checks" id="re-checks" role="status"></div>
      </div><div class="re-inspector">
        <label>Roof face<select id="re-face"></select></label>
        <label>Name<input id="re-name" maxlength="80"></label>
        <div class="re-inline"><button id="re-delete">Delete face</button><button id="re-restore">Restore detections</button></div>
        <label>Corner<select id="re-corner"></select></label>
        <div class="re-coords"><label>East (m)<input id="re-x" type="number" step="0.05"></label><label>North (m)<input id="re-north" type="number" step="0.05"></label><label>Height (m)<input id="re-y" type="number" min="0.05" max="100" step="0.05"></label></div>
        <small>Positions from the address point; height above site ground.</small>
        <label class="re-check"><input type="checkbox" id="re-linked" checked> Move shared corners together</label>
        <div class="re-inline"><button id="re-insert">Insert corner after</button><button id="re-remove">Remove corner</button><button id="re-split">Split at corners</button></div>
        <div class="re-coords"><label>Pitch (°)<input id="re-pitch" type="number" min="0" max="80" step="0.5"></label><label>Facing (°)<input id="re-bearing" type="number" step="1"></label></div>
        <small>Facing: N 0°, E 90°, S 180°, W 270°. The selected corner anchors the plane.</small>
        <div class="re-inline"><button id="re-plane">Apply pitch to face</button><button id="re-triangles">Triangulate face</button></div>
        <strong class="re-caption">Fit heights to DSM</strong>
        <small>Keeps your outlines; fits height and pitch. Selected also fits joined faces to keep ridges continuous. Small faces without reliable samples use their existing slopes as a guide, joined to the fitted roof. Split faces at ridges and dormers first.</small>
        <div class="re-inline"><button id="re-dsm-selected">Refit selected to DSM</button><button id="re-dsm-all">Refit all to DSM</button></div>
        <div id="re-dsm-report" class="re-note" role="status" style="white-space:pre-line"></div>
        <label class="re-check"><input id="re-dsm-points" type="checkbox"> Show original DSM samples</label>
        <strong class="re-caption">3D preview · drag to orbit</strong><div id="re-preview"></div>
        <label>Photo / floorplan reference<select id="re-photo"><option value="">Choose reference…</option></select></label><a id="re-reference-link" href="#" title="Enlarge reference" hidden><img id="re-reference" alt="Property reference"></a>
        <p class="re-note">Apply updates the ASHP model and its landmarks. Existing photo matches require review. Solar survey detections remain available in Solar mode. Measurements should be checked against the property.</p>
      </div></div>`;
    document.body.appendChild(el);dialog=el;
    const $=id=>el.querySelector('#'+id),svg=$('re-plan');
    let box=[-20,-20,40,40];
    const selectedFace=()=>faces.find(f=>f.id===selected);
    function snapshot(){return {faces:E.clone(faces),selected,corner,guidedIds:[...guidedFaces],report:$('re-dsm-report').textContent};}
    function clearReport(){$('re-dsm-report').textContent='';guidedFaces.clear();}
    function checkpoint(){undo.push(snapshot());clearReport();if(undo.length>100)undo.shift();redo=[];}
    function restore(s){guidedFaces=new Set(s.guidedIds||[]);$('re-dsm-report').textContent=s.report||'';faces=E.clone(s.faces);selected=s.selected;corner=s.corner;drawing=null;splitFrom=null;refresh();}
    function mutate(fn){checkpoint();fn();refresh();}
    function fit(){const pts=faces.flatMap(f=>f.ring);const minX=Math.min(...pts.map(p=>p.x))-5,maxX=Math.max(...pts.map(p=>p.x))+5,minZ=Math.min(...pts.map(p=>p.z))-5,maxZ=Math.max(...pts.map(p=>p.z))+5;box=[minX,minZ,maxX-minX,maxZ-minZ];const span=Math.max(maxX-minX-10,maxZ-minZ-10,6);orbit.target.set((minX+maxX)/2,3,(minZ+maxZ)/2);previewCamera.position.copy(orbit.target).add(new THREE.Vector3(span,span*.8,span));orbit.update();drawPlan();renderPreview();}
    function planPoint(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());}
    function snap(p,exclude) {
      if(!$('re-snap').checked)return p;
      let best=null,distance=.25;
      faces.forEach(f=>f.ring.forEach(v=>{if(exclude && Math.hypot(v.x-exclude.x,v.z-exclude.z)<1e-5)return;const d=Math.hypot(v.x-p.x,v.z-p.z);if(d<distance){distance=d;best=v;}}));
      return best ? {x:best.x,z:best.z,y:best.y} : p;
    }
    const frame=E.propertyFrame(siteData),bbox=siteData.image_bounding_box;
    const nw=frame.point([bbox[0],bbox[3],siteData.property_details.altitude]);
    const se=frame.point([bbox[2],bbox[1],siteData.property_details.altitude]);
    const ns='http://www.w3.org/2000/svg';
    function node(tag,attrs,parent=svg){const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));parent.appendChild(n);return n;}
    function drawPlan(){
      svg.setAttribute('viewBox',box.join(' '));svg.replaceChildren();
      node('image',{href:window.__AERIAL_DATAURL__,x:nw.x,y:nw.z,width:se.x-nw.x,height:se.z-nw.z,preserveAspectRatio:'none'});
      if($('re-grid').checked){const lines=[];for(let x=Math.floor(box[0]);x<=box[0]+box[2];x++)lines.push(`M${x},${box[1]}v${box[3]}`);for(let z=Math.floor(box[1]);z<=box[1]+box[3];z++)lines.push(`M${box[0]},${z}h${box[2]}`);node('path',{d:lines.join(' '),fill:'none',stroke:'#ffffff55','stroke-width':.025,'pointer-events':'none'});}
      const r=Math.max(.07,box[2]*.007);
      faces.forEach(f=>{
        const on=f.id===selected;
        node('polygon',{points:f.ring.map(p=>p.x+','+p.z).join(' '),fill:guidedFaces.has(f.id)?'#c8a4ff66':on?'#f5b94244':'#36bfc944',stroke:on?'#ffcb60':'#81e7ed','stroke-width':on?3:1.5,'vector-effect':'non-scaling-stroke','data-face':f.id});
        });
      const active=selectedFace();
      if(active)active.ring.forEach((p,i)=>{
          node('circle',{cx:p.x,cy:p.z,r,fill:i===corner?'#fff':'#ffcb60',stroke:'#12161b','stroke-width':1.5,'vector-effect':'non-scaling-stroke','data-face':active.id,'data-corner':i});
          const text=node('text',{x:p.x+r*1.4,y:p.z-r*1.4,fill:'white','font-size':r*2.7,'paint-order':'stroke',stroke:'#111','stroke-width':r*.5,'pointer-events':'none'});text.textContent=i+1;
      });
      if(drawing){node('polyline',{points:drawing.ring.map(p=>p.x+','+p.z).join(' '),fill:'#ffcb6033',stroke:'#ffcb60','stroke-width':3,'vector-effect':'non-scaling-stroke','pointer-events':'none'});drawing.ring.forEach(p=>node('circle',{cx:p.x,cy:p.z,r,fill:'#ffcb60','pointer-events':'none'}));}
    }
    // The preview uses raw corrected vertices so a ridge cannot be silently
    // squared or height-levelled behind the editor's numbered handles.
    const previewScene=new THREE.Scene();previewScene.background=new THREE.Color(0x161d26);
    const previewCamera=new THREE.PerspectiveCamera(42,1,.05,500);previewCamera.position.set(20,25,25);
    const previewRenderer=new THREE.WebGLRenderer({antialias:true});previewRenderer.setPixelRatio(Math.min(devicePixelRatio,2));$('re-preview').appendChild(previewRenderer.domElement);
    const orbit=new THREE.OrbitControls(previewCamera,previewRenderer.domElement);orbit.target.set(0,3,0);orbit.enableDamping=false;
    previewScene.add(new THREE.HemisphereLight(0xffffff,0x445566,1.5));
    const grid=new THREE.GridHelper(100,100,0x506070,0x263646);previewScene.add(grid);
    let previewGroup=new THREE.Group();previewScene.add(previewGroup);
    function renderPreview(){const rect=$('re-preview').getBoundingClientRect();previewRenderer.setSize(rect.width,rect.height,false);previewCamera.aspect=rect.width/rect.height;previewCamera.updateProjectionMatrix();previewRenderer.render(previewScene,previewCamera);}
    function rebuildPreview(result){
      previewGroup.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose();});previewGroup.clear();
      faces.forEach(f=>{
        const positions=[];G.triangulatePolygon(f.ring.map(p=>[p.x,p.z])).forEach(t=>t.forEach(i=>{const p=f.ring[i];positions.push(p.x,p.y,p.z);}));
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
        previewGroup.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:guidedFaces.has(f.id)?0xc8a4ff:f.id===selected?0xf5b942:0x93b8bc,side:THREE.DoubleSide,roughness:.8,transparent:$('re-dsm-points').checked,opacity:$('re-dsm-points').checked?.55:1})));
        const points=f.ring.map(p=>new THREE.Vector3(p.x,p.y,p.z));if(points.length)points.push(points[0].clone());
        previewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x101820})));
      });
      if($('re-dsm-points').checked && dsm?.grid){
        const positions=faces.flatMap(f=>D.samplesFor(f,dsm,siteData,0).flatMap(p=>[p.x,p.y,p.z]));
        const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
        previewGroup.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:0x45eaff,size:.08,depthTest:false,transparent:true,opacity:.85})));
      }
      if(result.solid){const positions=[];result.solid.wallPanels.forEach(w=>{for(let i=1;i<w.ids.length;i++){const a=result.solid.clusters[w.ids[i-1]],b=result.solid.clusters[w.ids[i]];positions.push(a.x,0,a.z,a.x,a.y,a.z,a.x,0,a.z,b.x,0,b.z);}});const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));previewGroup.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x7b8b9b})));}
      renderPreview();
    }
    orbit.addEventListener('change',renderPreview);const resize=new ResizeObserver(renderPreview);resize.observe($('re-preview'));
    function refresh(){
      if(!selectedFace()){selected=faces[0]?.id;corner=0;}
      const f=selectedFace();corner=Math.min(corner,Math.max(0,(f?.ring.length||1)-1));
      $('re-face').replaceChildren();faces.forEach(f=>{const o=new Option(f.name,f.id);$('re-face').add(o);});$('re-face').value=selected || '';
      $('re-name').value=f?.name || '';$('re-corner').replaceChildren();
      if(f)f.ring.forEach((p,i)=>$('re-corner').add(new Option('Corner '+(i+1),i)));$('re-corner').value=corner;
      const p=f?.ring[corner];$('re-x').value=p?p.x.toFixed(3):'';$('re-north').value=p?(-p.z).toFixed(3):'';$('re-y').value=p?p.y.toFixed(3):'';
      if(f){const plane=G.fitPlane(f.ring);$('re-pitch').value=(Math.atan(Math.hypot(plane.a,plane.b))*180/Math.PI).toFixed(2);$('re-bearing').value=((Math.atan2(-plane.a,plane.b)*180/Math.PI+360)%360).toFixed(2);}
      ['re-name','re-corner','re-x','re-north','re-y','re-delete','re-redraw','re-insert','re-remove','re-split','re-plane','re-triangles','re-pitch','re-bearing'].forEach(id=>$(id).disabled=!f || !!drawing);
      $('re-dsm-selected').disabled=!f || !!drawing || !dsm?.grid;
      $('re-dsm-all').disabled=!faces.length || !!drawing || !dsm?.grid;
      $('re-dsm-points').disabled=!dsm?.grid;
      $('re-finish').hidden=$('re-stop').hidden=!drawing;$('re-add').disabled=!!drawing;$('re-undo').disabled=!undo.length;$('re-redo').disabled=!redo.length;
      const result=E.validate(faces);
      $('re-apply').disabled=!!drawing || !!result.errors.length;
      $('re-checks').textContent=[...result.errors,...result.warnings].join(' ') || 'Closed geometry · '+faces.length+' roof faces. Check the preview before applying.';
      $('re-checks').classList.toggle('invalid',!!result.errors.length);
      $('re-checks').classList.toggle('warning',!result.errors.length && !!result.warnings.length);
      $('re-hint').textContent=drawing?'Click corners around the roof. Click the first point or press Enter to finish. Esc cancels drawing.':splitFrom!==null?'Click another non-adjacent corner to split the selected face.':'Click a face, then drag its numbered corners. Shift-drag pans; scroll zooms. North is up.';
      drawPlan();rebuildPreview(result);
    }
    function cancelDrawing(){drawing=null;splitFrom=null;refresh();}
    function finishDrawing(){
      if(!drawing || drawing.ring.length<3)return;
      const f={id:drawing.id,name:drawing.name,active:true,ring:drawing.ring};
      mutate(()=>{if(drawing.replace)faces=faces.map(old=>old.id===drawing.id?f:old);else faces.push(f);selected=f.id;corner=0;drawing=null;});
    }
    function refitDSM(id){
      const result=D.refit(faces,dsm,siteData,id);
      if(result.changed){checkpoint();faces=result.faces;guidedFaces=new Set(result.reports.filter(r=>r.status==='guided').map(r=>r.id));$('re-dsm-points').checked=true;refresh();}
      $('re-dsm-report').textContent=result.reports.map(r=>r.error?((r.name?r.name+': ':'')+r.error):(r.status==='guided'?`${r.name}: Guided shape (purple) · ${r.reason.startsWith('Too few')?'sparse DSM':'unreliable DSM plane'} · pitch change ${r.pitchChange.toFixed(1)}° · max height change ${r.maxHeightChange.toFixed(2)} m`:`${r.name}: DSM fit · ${r.inliers}/${r.samples} samples · residual ${r.before.toFixed(2)} → ${r.after.toFixed(2)} m · pitch ${r.pitch.toFixed(1)}°`)).join('\n')+(guidedFaces.size?'\nPurple faces use their previous slopes as a guide, joined to fitted neighbours. They are not DSM fits; check them against photos.':'')+(result.changed?'\nDraft updated. Residual measures agreement with DSM, not survey accuracy. Check the preview, then apply or undo.':'');
    }
    $('re-dsm-selected').onclick=()=>refitDSM(selected);
    $('re-dsm-all').onclick=()=>refitDSM(null);
    $('re-dsm-points').onchange=()=>rebuildPreview(E.validate(faces));
    $('re-add').onclick=()=>{drawing={id:newId(),name:'New roof face',ring:[],plane:{a:0,b:0,c:3}};refresh();};
    $('re-redraw').onclick=()=>{const f=selectedFace();drawing={id:f.id,name:f.name,ring:[],replace:true,plane:G.fitPlane(f.ring)};refresh();};
    $('re-finish').onclick=finishDrawing;$('re-stop').onclick=cancelDrawing;$('re-fit').onclick=fit;$('re-grid').onchange=drawPlan;
    $('re-undo').onclick=()=>{if(undo.length){redo.push(snapshot());restore(undo.pop());}};
    $('re-redo').onclick=()=>{if(redo.length){undo.push(snapshot());restore(redo.pop());}};
    $('re-face').onchange=()=>{selected=$('re-face').value;corner=0;splitFrom=null;refresh();};
    $('re-corner').onchange=()=>{corner=+$('re-corner').value;refresh();};
    $('re-name').onchange=()=>mutate(()=>selectedFace().name=$('re-name').value.trim() || 'Roof face');
    ['re-x','re-north','re-y'].forEach(id=>$(id).onchange=()=>{const p={x:$('re-x').valueAsNumber,z:-$('re-north').valueAsNumber,y:$('re-y').valueAsNumber};if(Object.values(p).every(Number.isFinite))mutate(()=>faces=E.moveCorner(faces,selected,corner,p,$('re-linked').checked));else refresh();});
    $('re-delete').onclick=()=>mutate(()=>{faces=faces.filter(f=>f.id!==selected);corner=0;});
    $('re-remove').onclick=()=>{if(selectedFace().ring.length<=3)return;mutate(()=>selectedFace().ring.splice(corner,1));};
    $('re-insert').onclick=()=>mutate(()=>{const f=selectedFace(),a=f.ring[corner],b=f.ring[(corner+1)%f.ring.length];f.ring.splice(corner+1,0,{id:newId(),x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2});corner++;});
    $('re-split').onclick=()=>{splitFrom=corner;refresh();};
    $('re-plane').onclick=()=>{const pitch=$('re-pitch').valueAsNumber,bearing=$('re-bearing').valueAsNumber;if(!Number.isFinite(pitch)||pitch<0||pitch>80||!Number.isFinite(bearing))return;mutate(()=>{const f=selectedFace(),p=f.ring[corner],s=Math.tan(pitch*Math.PI/180),a=-Math.sin(bearing*Math.PI/180)*s,b=Math.cos(bearing*Math.PI/180)*s;f.ring.forEach(v=>v.y=p.y+a*(v.x-p.x)+b*(v.z-p.z));});};
    $('re-triangles').onclick=()=>mutate(()=>{const f=selectedFace(),triangles=G.triangulatePolygon(f.ring.map(p=>[p.x,p.z])).map((t,i)=>({id:i?newId():f.id,name:f.name+' · '+(i+1),active:f.active,ring:t.map(j=>E.clone(f.ring[j]))}));faces=faces.flatMap(old=>old.id===f.id?triangles:[old]);corner=0;});
    $('re-restore').onclick=()=>mutate(()=>{faces=E.clone(building.roofBase);selected=faces[0].id;corner=0;});
    svg.addEventListener('pointerdown',e=>{
      if(e.button!==0)return;const p=planPoint(e);
      if(e.shiftKey){drag={pan:true,start:p,box:box.slice()};svg.setPointerCapture(e.pointerId);return;}
      if(drawing){const v=snap({x:p.x,z:p.y,y:G.planeY(drawing.plane,p.x,p.y)});if(drawing.ring.length>=3 && Math.hypot(v.x-drawing.ring[0].x,v.z-drawing.ring[0].z)<.3){finishDrawing();return;}drawing.ring.push({id:newId(),...v});refresh();return;}
      const fid=e.target.getAttribute('data-face'),ci=e.target.getAttribute('data-corner');
      if(!fid)return;
      if(splitFrom!==null && fid===selected && ci!==null){try{const parts=E.splitFace(selectedFace(),splitFrom,+ci,newId());mutate(()=>{faces=faces.flatMap(f=>f.id===selected?parts:[f]);corner=0;splitFrom=null;});}catch(err){$('re-hint').textContent=err.message;}return;}
      selected=fid;if(ci!==null){corner=+ci;const original=snapshot();drag={original,point:E.clone(selectedFace().ring[corner]),start:p,moved:false};svg.setPointerCapture(e.pointerId);}else corner=0;
      refresh();
    });
    svg.addEventListener('pointermove',e=>{
      if(!drag)return;const p=planPoint(e);
      if(drag.pan){box[0]-=p.x-drag.start.x;box[1]-=p.y-drag.start.y;drawPlan();return;}
      const v=snap({x:drag.point.x+p.x-drag.start.x,z:drag.point.z+p.y-drag.start.y,y:drag.point.y},drag.point);
      clearReport();drag.moved=true;faces=E.moveCorner(drag.original.faces,selected,corner,v,$('re-linked').checked);refresh();
    });
    function finishDrag(){if(drag?.moved){undo.push(drag.original);redo=[];}drag=null;refresh();}
    svg.addEventListener('pointerup',finishDrag);svg.addEventListener('pointercancel',()=>{if(drag?.original)faces=drag.original.faces;drag=null;refresh();});
    svg.addEventListener('wheel',e=>{e.preventDefault();const p=planPoint(e),scale=e.deltaY>0?1.12:1/1.12;if(box[2]*scale<3||box[2]*scale>150)return;box=[p.x+(box[0]-p.x)*scale,p.y+(box[1]-p.y)*scale,box[2]*scale,box[3]*scale];drawPlan();},{passive:false});
    const references=[...(window.IMAGE_DATA?.images || []),...(window.IMAGE_DATA?.floorplan?[window.IMAGE_DATA.floorplan]:[])];
    references.forEach(im=>$('re-photo').add(new Option(im.caption || im.side || im.kind,im.id)));
    $('re-photo').onchange=()=>{const im=references.find(im=>im.id===$('re-photo').value);$('re-reference-link').hidden=!im;if(im){const url=window.SolarViz.imageUrl(im);$('re-reference').src=url;}};
    let fullReference=null;
    function closeReference(){if(fullReference){fullReference.remove();fullReference=null;}}
    $('re-reference-link').onclick=e=>{e.preventDefault();closeReference();fullReference=document.createElement('div');fullReference.className='re-reference-full';const image=document.createElement('img');image.src=$('re-reference').src;image.alt=$('re-photo').selectedOptions[0].textContent;const closeButton=document.createElement('button');closeButton.textContent='Close reference';closeButton.onclick=closeReference;fullReference.append(image,closeButton);el.appendChild(fullReference);closeButton.focus();};
    const initialPhoto=references.find(im=>im.kind==='exterior');if(initialPhoto){$('re-photo').value=initialPhoto.id;$('re-photo').onchange();}
    function close(){resize.disconnect();orbit.dispose();previewGroup.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});grid.geometry.dispose();grid.material.dispose();previewRenderer.dispose();el.remove();dialog=null;window.removeEventListener('keydown',key);button.focus();}
    $('re-cancel').onclick=close;
    $('re-apply').onclick=()=>{const result=building.applyRoofEdits(E.diff(building.roofBase,faces));if(result.errors.length){$('re-checks').textContent=result.errors.join(' ');return;}close();};
    function key(e){if(!dialog)return;if(e.key==='Tab'){const controls=Array.from(el.querySelectorAll('button,input,select,[tabindex],a[href]')).filter(n=>!n.disabled&&n.getClientRects().length);const i=controls.indexOf(document.activeElement);if((e.shiftKey&&i<=0)||(!e.shiftKey&&i===controls.length-1)){e.preventDefault();controls[e.shiftKey?controls.length-1:0].focus();}return;}if(e.key==='Escape'){e.stopImmediatePropagation();if(fullReference){closeReference();return;}drawing||splitFrom!==null?cancelDrawing():close();return;}if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='Enter'&&drawing){e.preventDefault();finishDrawing();}if(e.key==='Backspace'&&drawing){e.preventDefault();drawing.ring.pop();refresh();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'re-redo':'re-undo').click();}}
    window.addEventListener('keydown',key);refresh();fit();svg.focus();
  }
};
