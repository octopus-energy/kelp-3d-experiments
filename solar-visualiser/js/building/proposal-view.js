window.SolarViz.createProposalView=function(data){
 const T=THREE,SV=SolarViz,host=document.getElementById('house-view'),scene=new T.Scene();scene.background=new T.Color(0xe8ede5);
 const camera=new T.PerspectiveCamera(39,1,.1,160),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.appendChild(renderer.domElement);
 const controls=new T.OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.target.set(2.5,2,8);controls.maxDistance=65;controls.minDistance=8;
 scene.add(new T.HemisphereLight(0xffffff,0x9cae93,2));const sun=new T.DirectionalLight(0xffffff,2.4);sun.position.set(-10,20,15);scene.add(sun);
 const grid=new T.GridHelper(36,36,0xc5d0bf,0xd5ddd0);grid.position.set(3,-2.65,-8);scene.add(grid);
 const house=new T.Group(),services=new T.Group();scene.add(house,services);
 // Semantic +v runs towards the rear. Reflect it into scene north (−Z).
 house.scale.z=-1;services.scale.z=-1;
 const mat=(color,opacity=1)=>new T.MeshStandardMaterial({color,side:T.DoubleSide,roughness:.85,transparent:opacity<1,opacity});
 const walls=mat(0xc7b398),roof=mat(0x79948a),edge=new T.LineBasicMaterial({color:0x587064,transparent:true,opacity:.6});
 const solid=SV.roofEdit.build(data.geometry.model.faces),model=SV.buildingSolid.buildSolidMeshes(solid,{wall:walls,roof,edge});house.add(model.group);
 const lower=SV.buildingProject.lowerGround(data.geometry.model.faces,{x:0,y:0,z:0},{enabled:true,depth:2.6,faceIds:data.geometry.model.faces.filter(f=>f.id.startsWith('main-')||f.id.startsWith('bay-')).map(f=>f.id)});
 for(const w of lower.wallPanels)house.add(new T.Mesh(SV.buildingSolid.wallGeometry(w,[]),mat(0x9daca7,.25)));
 const openings=data.geometry.model.openings;
 for(const w of solid.wallPanels){const holes=[];for(const o of openings){if(o.ring.some(p=>Math.abs((p[0]-w.a2[0])*w.normal[0]+(p[2]-w.a2[1])*w.normal[1])>.02))continue;const u=o.ring.map(p=>(p[0]-w.a2[0])*w.dir[0]+(p[2]-w.a2[1])*w.dir[1]),ys=o.ring.map(p=>p[1]);if(Math.min(...u)<0||Math.max(...u)>w.len||Math.min(...ys)<w.bottom)continue;holes.push({ring:u.map((v,i)=>[v,ys[i]]),u0:Math.min(...u),u1:Math.max(...u),v0:Math.min(...ys),v1:Math.max(...ys)});}if(holes.length){const mesh=model.wallMeshes.find(m=>m.userData.wallId===w.id);mesh.geometry.dispose();mesh.geometry=SV.buildingSolid.wallGeometry(w,holes);}}
 for(const o of openings){const positions=[];for(let i=1;i<o.ring.length-1;i++)positions.push(...o.ring[0],...o.ring[i],...o.ring[i+1]);const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();house.add(new T.Mesh(g,mat(o.kind==='door'?0x607e72:0xabcbd0,.9)));}
 function render(){const b=host.getBoundingClientRect();if(!b.width||!b.height)return;renderer.setSize(b.width,b.height,false);camera.aspect=b.width/b.height;camera.updateProjectionMatrix();renderer.render(scene,camera);}
 controls.addEventListener('change',render);new ResizeObserver(render).observe(host);
 function view(side){if(side==='front')camera.position.set(17,11,17);else camera.position.set(18,14,-28);controls.target.set(2.7,2,-7);controls.update();render();}
 function label(text,position){const c=document.createElement('canvas');c.width=text.length<4?80:512;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#fcfdf8';ctx.fillRect(0,0,c.width,80);ctx.fillStyle='#21493e';ctx.font='500 27px sans-serif';ctx.textAlign='center';ctx.fillText(text,c.width/2,49);const sprite=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false}));sprite.renderOrder=30;sprite.material.depthWrite=false;sprite.scale.set(text.length<4?.7:5,.78,1);sprite.position.set(...position);services.add(sprite);}
 let onMarkerSelect=null;
 function update(result,chapter,{showServices=chapter===2||chapter===3||chapter===4,spatialItems=[],paths=[],onSelect=null}={}){
  onMarkerSelect=onSelect;services.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});services.clear();services.name='installation-services';const show=showServices;
  walls.transparent=show;walls.opacity=show?.38:1;roof.transparent=show;roof.opacity=show?.48:1;
  if(show){const r=result.routing,hp=new T.Mesh(new T.BoxGeometry(1.1,.95,.45),mat(0xf4f5ee));hp.userData.markerId="proposed:heatPump";hp.position.set(...r.hp);services.add(hp);const fan=new T.Mesh(new T.CylinderGeometry(.34,.34,.02,32),mat(0x52675e));fan.rotation.x=Math.PI/2;fan.position.set(r.hp[0],r.hp[1],r.hp[2]+.235);services.add(fan);label('Outdoor unit · option',[r.hp[0]+.8,r.hp[1]+1.45,r.hp[2]]);
   if(r.cylinder){const cy=new T.Mesh(new T.CylinderGeometry(.35,.35,1.5,32),mat(0x58a2b5));cy.userData.markerId="proposed:cylinder";cy.position.set(...r.cylinder);services.add(cy);label('Cylinder · proposed space',[r.cylinder[0],r.cylinder[1]+1.6,r.cylinder[2]]);
    const g=new T.BufferGeometry().setFromPoints(r.points.map(p=>new T.Vector3(...p))),line=new T.Line(g,new T.LineDashedMaterial({color:0xd97538,dashSize:.2,gapSize:.12,depthTest:false}));line.name='hydraulic-route';line.computeLineDistances();line.renderOrder=10;services.add(line);
    for(let i=1;i<r.points.length;i++){const a=new T.Vector3(...r.points[i-1]),b=new T.Vector3(...r.points[i]),delta=b.clone().sub(a),length=delta.length();if(length<.01)continue;const dir=delta.normalize();for(let d=0;d<length;d+=.32){const len=Math.min(.2,length-d),dash=new T.Mesh(new T.CylinderGeometry(.027,.027,len,6),new T.MeshBasicMaterial({color:0xc66227,depthTest:false}));dash.position.copy(a).addScaledVector(dir,d+len/2);dash.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir);dash.renderOrder=20;services.add(dash);}}
   }
  }
  for(const item of spatialItems.filter(m=>m.kind!=='proposed')){const m=new T.Mesh(new T.SphereGeometry(.19,16,12),new T.MeshBasicMaterial({color:item.kind==='radiator'?0x537f98:0x286e59,depthTest:false}));m.position.set(...item.xyz);m.userData.markerId=item.id;m.renderOrder=25;services.add(m);label(item.short,[item.xyz[0],item.xyz[1]+.5,item.xyz[2]]);}
  for(const path of paths){const g=new T.BufferGeometry().setFromPoints(path.points.map(p=>new T.Vector3(...SV.spatial.point(data,p,.06)))),line=new T.Line(g,new T.LineDashedMaterial({color:0xa25467,dashSize:.25,gapSize:.15,depthTest:false}));line.name='keep-clear-path';line.computeLineDistances();line.renderOrder=26;services.add(line);}
  render();
 }
 let start=null;renderer.domElement.addEventListener('pointerdown',e=>start=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!onMarkerSelect||!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>5)return;const b=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2),camera);const hit=ray.intersectObjects(services.children).find(h=>h.object.userData.markerId);if(hit)onMarkerSelect(hit.object.userData.markerId);});
 view('front');return {view,update,render,scene,renderer,camera,services};
};
