// Pure polygon operations shared by floor slicing and thermal surface allocation.
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./geometry.js'));else root.SolarViz.planGeometry=factory(root.SolarViz.buildingGeometry);})(typeof window!=='undefined'?window:globalThis,function(G){
'use strict';
const EPS=1e-6,cross=(a,b)=>a[0]*b[1]-a[1]*b[0],sub=(a,b)=>[a[0]-b[0],a[1]-b[1]],mix=(a,b,t)=>[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
function clip(poly,value){const out=[];poly.forEach((a,i)=>{const b=poly[(i+1)%poly.length],va=value(a),vb=value(b);if(va>=-1e-9)out.push(a);if((va>=0)!==(vb>=0))out.push(mix(a,b,va/(va-vb)));});return out;}
function intersection(a,b){const out=[];for(const at of G.triangulatePolygon(a))for(const bt of G.triangulatePolygon(b)){let p=at.map(i=>a[i]);const t=bt.map(i=>b[i]),signedArea=G.polygonArea(t);if(Math.abs(signedArea)<1e-10||Math.abs(G.polygonArea(p))<1e-10)continue;const sign=Math.sign(signedArea);for(let i=0;i<3&&p.length;i++){const x=t[i],y=t[(i+1)%3];p=clip(p,q=>sign*cross(sub(y,x),sub(q,x)));}if(p.length>=3&&Math.abs(G.polygonArea(p))>1e-8)out.push(p);}return out;}
const area=polys=>polys.reduce((s,p)=>s+Math.abs(G.polygonArea(p)),0);
function unionLoops(polys){
 const edges=polys.flatMap(p=>p.map((a,i)=>[a,p[(i+1)%p.length]])),segments=[];
 for(const [a,b] of edges){const d=sub(b,a),len=Math.hypot(...d);if(len<EPS)continue;const cuts=[0,1];
  for(const [c,e] of edges){const v=sub(e,c),den=cross(d,v);if(Math.abs(den)>1e-10){const t=cross(sub(c,a),v)/den,u=cross(sub(c,a),d)/den;if(t>EPS&&t<1-EPS&&u>=-EPS&&u<=1+EPS)cuts.push(t);}else if(Math.abs(cross(sub(c,a),d))/len<EPS){for(const q of [c,e]){const t=((q[0]-a[0])*d[0]+(q[1]-a[1])*d[1])/(len*len);if(t>EPS&&t<1-EPS)cuts.push(t);}}}
  const ts=[...new Set(cuts.map(v=>Math.round(v*1e9)/1e9))].sort((a,b)=>a-b);
  for(let i=1;i<ts.length;i++){const u=mix(a,b,ts[i-1]),v=mix(a,b,ts[i]),m=mix(u,v,.5),n=[-d[1]/len*1e-5,d[0]/len*1e-5];const inside=s=>polys.some(p=>G.pointInPolygon(p,m[0]+s*n[0],m[1]+s*n[1]));const left=inside(1),right=inside(-1);if(left!==right)segments.push(left?[u,v]:[v,u]);}
 }
 const key=p=>p.map(v=>Math.round(v*1e5)).join(','),unique=new Map();segments.forEach(s=>unique.set(key(s[0])+'>'+key(s[1]),s));const pending=[...unique.values()],loops=[];
 while(pending.length){const edge=pending.pop(),loop=[edge[0]],start=key(edge[0]);let end=edge[1],guard=0;while(key(end)!==start&&guard++<segments.length+1){loop.push(end);const idx=pending.findIndex(e=>key(e[0])===key(end));if(idx<0)throw Error('Floor boundary could not be joined');end=pending.splice(idx,1)[0][1];}if(loop.length>=3)loops.push(G.straightenCollinear(loop,.02));}
 return loops.sort((a,b)=>Math.abs(G.polygonArea(b))-Math.abs(G.polygonArea(a)));
}
return {clip,intersection,area,unionLoops};
});
