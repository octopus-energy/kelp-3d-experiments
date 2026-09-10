// Pure projection and replay helpers for the reconstruction review workbench.
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory();else(root.SolarViz=root.SolarViz||{}).reconstruction=factory();})(typeof window!=='undefined'?window:globalThis,function(){
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  function project(points,c){const [x,y,z,yaw,pitch,roll,fov]=c,f=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)],r=[Math.cos(yaw),0,-Math.sin(yaw)],up=[-Math.sin(yaw)*Math.sin(pitch),Math.cos(pitch),-Math.cos(yaw)*Math.sin(pitch)],rr=r.map((v,i)=>v*Math.cos(roll)+up[i]*Math.sin(roll)),uu=up.map((v,i)=>v*Math.cos(roll)-r[i]*Math.sin(roll)),focal=683/2/Math.tan(fov*Math.PI/360);return points.map(p=>{const q=[p[0]-x,p[1]-y,p[2]-z],depth=dot(q,f);return [512+focal*dot(q,rr)/Math.max(depth,.1),341.5+(c[7]||0)-focal*dot(q,uu)/Math.max(depth,.1),depth];});}
  function world(points,p){const a=p.bearing*Math.PI/180;return points.map(([u,y,v])=>[p.anchor_x+u*Math.sin(a)-v*Math.cos(a),y,p.anchor_z-u*Math.cos(a)-v*Math.sin(a)]);}
  function evaluate(stage,photo){const o=photo.observations.filter(o=>photo.role==='fit'||o.use==='check'),prediction=project(o.map(o=>stage.model.landmarks[o.landmark]),photo.camera);return Math.sqrt(o.reduce((s,o,i)=>s+(prediction[i][0]-o.px[0]*1024)**2+(prediction[i][1]-o.px[1]*683)**2,0)/o.length);}
  return {project,world,evaluate};
});
