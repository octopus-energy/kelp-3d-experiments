// Display-only triangle clipping: preserve the DSM heights and image coordinates
// outside the exact mask. No buffer around the house, and no invented ground plane.
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./geometry.js'));else root.SolarViz.terrainCutout=factory(root.SolarViz.buildingGeometry);})(typeof window!=='undefined'?window:globalThis,function(G){
'use strict';
function clip(poly,value){const out=[];poly.forEach((a,i)=>{const b=poly[(i+1)%poly.length],va=value(a),vb=value(b);if(va>=0)out.push(a);if((va>=0)!==(vb>=0)){const t=va/(va-vb);out.push(a.map((v,j)=>v+(b[j]-v)*t));}});return out;}
function subtract(poly,tri,aboveY){let inside=poly;const out=[],sign=Math.sign(G.polygonArea(tri));for(let i=0;i<3&&inside.length>=3;i++){const a=tri[i],b=tri[(i+1)%3],value=p=>sign*((b[0]-a[0])*(p[2]-a[1])-(b[1]-a[1])*(p[0]-a[0]));const outside=clip(inside,p=>-value(p));if(outside.length>=3)out.push(outside);inside=clip(inside,value);}if(Number.isFinite(aboveY)&&inside.length>=3){const below=clip(inside,p=>aboveY-p[1]);if(below.length>=3)out.push(below);}return out;}
function cut({positions,uvs,indices,normals},masks){
 const cutters=masks.flatMap(mask=>{const poly=Array.isArray(mask)?mask:mask.poly,aboveY=Array.isArray(mask)?undefined:mask.aboveY;return G.triangulatePolygon(poly).map(ids=>({t:ids.map(i=>poly[i]),aboveY}));}).filter(c=>Math.abs(G.polygonArea(c.t))>1e-10).map(c=>({...c,x0:Math.min(...c.t.map(p=>p[0])),x1:Math.max(...c.t.map(p=>p[0])),z0:Math.min(...c.t.map(p=>p[1])),z1:Math.max(...c.t.map(p=>p[1]))}));
 const positionsOut=[],uvsOut=[],normalsOut=[];
 for(let i=0;i<indices.length;i+=3){const tri=Array.from(indices.slice(i,i+3),j=>[positions[j*3],positions[j*3+1],positions[j*3+2],uvs[j*2],uvs[j*2+1],...(normals?Array.from(normals.slice(j*3,j*3+3)):[])]),x0=Math.min(...tri.map(p=>p[0])),x1=Math.max(...tri.map(p=>p[0])),z0=Math.min(...tri.map(p=>p[2])),z1=Math.max(...tri.map(p=>p[2]));let parts=[tri];
 for(const c of cutters){if(c.x1<=x0||c.x0>=x1||c.z1<=z0||c.z0>=z1)continue;parts=parts.flatMap(p=>subtract(p,c.t,c.aboveY));}
 for(const p of parts)for(let j=1;j<p.length-1;j++){const t=[p[0],p[j],p[j+1]];if(Math.abs(G.polygonArea(t.map(v=>[v[0],v[2]])))<1e-10)continue;for(const v of t){positionsOut.push(...v.slice(0,3));uvsOut.push(...v.slice(3,5));if(normals)normalsOut.push(...v.slice(5));}}
 }
 return {positions:positionsOut,uvs:uvsOut,...(normals?{normals:normalsOut}:{})};
}
// A frontage-only section, bounded by the house width. No side/rear buffer.
function frontage({footprint,frontRing,bearing,groundY,openingBaseY,reveal=false}){
 const a=bearing*Math.PI/180,u=[Math.sin(a),-Math.cos(a)],v=[-Math.cos(a),-Math.sin(a)],dot=(p,d)=>p[0]*d[0]+p[1]*d[1];
 const x0=Math.min(...footprint.map(p=>dot(p,u))),x1=Math.max(...footprint.map(p=>dot(p,u))),z0=Math.min(...footprint.map(p=>dot(p,v)))-1.5,z1=Math.min(...frontRing.map(p=>dot([p.x,p.z],v)))+.05;
 const poly=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z])=>[x*u[0]+z*v[0],x*u[1]+z*v[1]]);
 const cutoff=Number.isFinite(openingBaseY)?Math.min(groundY,openingBaseY-.1):groundY;
 return {poly,...(!reveal?{aboveY:cutoff}:{})};
}
return {cut,frontage};
});
