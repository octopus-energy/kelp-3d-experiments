// Roof-plane fitting against the original DSM. Pure UMD; no rendered terrain,
// DOM, THREE or stored scene coordinates. The outline stays fixed in plan.
(function (root,factory) {
  if(typeof module!=='undefined' && module.exports) module.exports=factory(require('./geometry.js'),require('./roof-edit.js'));
  else root.SolarViz.roofDSM=factory(root.SolarViz.buildingGeometry,root.SolarViz.roofEdit);
})(typeof window!=='undefined'?window:globalThis,function(G,E) {
  const median=a=>{const b=a.slice().sort((a,b)=>a-b),i=Math.floor(b.length/2);return b.length%2?b[i]:(b[i-1]+b[i])/2;};
  function samplesFor(face,dsm,site,margin=.3) {
    const addr=site.property_details.geocoded_address,cell=dsm.cellsize;
    const poly=face.ring.map(p=>[p.x,p.z]);
    const x0=dsm.xll-addr.easting,z0=addr.northing-dsm.yll-dsm.nrows*cell;
    const c0=Math.max(0,Math.floor((Math.min(...poly.map(p=>p[0]))-x0)/cell));
    const c1=Math.min(dsm.ncols-1,Math.ceil((Math.max(...poly.map(p=>p[0]))-x0)/cell));
    const r0=Math.max(0,Math.floor((Math.min(...poly.map(p=>p[1]))-z0)/cell));
    const r1=Math.min(dsm.nrows-1,Math.ceil((Math.max(...poly.map(p=>p[1]))-z0)/cell));
    const samples=[];
    for(let r=r0;r<=r1;r++)for(let c=c0;c<=c1;c++) {
      const x=x0+(c+.5)*cell,z=z0+(r+.5)*cell,value=dsm.grid[r*dsm.ncols+c];
      if(!Number.isFinite(value)||value===dsm.nodata||!G.pointInPolygon(poly,x,z))continue;
      if(poly.some((a,i)=>{const b=poly[(i+1)%poly.length];return G.distPointToSegment(x,z,a[0],a[1],b[0],b[1]).d<margin;}))continue;
      const y=value-site.property_details.altitude;
      if(y>.1 && y<100)samples.push({x,y,z});
    }
    return samples;
  }
  function spatialCoverage(points) {
    const cx=points.reduce((s,p)=>s+p.x,0)/points.length,cz=points.reduce((s,p)=>s+p.z,0)/points.length;
    let xx=0,zz=0,xz=0;
    points.forEach(p=>{xx+=(p.x-cx)**2;zz+=(p.z-cz)**2;xz+=(p.x-cx)*(p.z-cz);});
    const n=points.length;
    return (xx+zz-Math.sqrt((xx-zz)**2+4*xz*xz))/(2*n);
  }
  function localFit(points) {
    if(points.length<8 || spatialCoverage(points)<.015) return {error:'Too few well-spread interior DSM samples. Its shape needs support from joined roof faces or measured heights.'};
    let seed=717, best=null;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let attempt=0;attempt<120;attempt++) {
      const three=Array.from({length:3},()=>points[Math.floor(rand()*points.length)]);
      if(Math.abs((three[1].x-three[0].x)*(three[2].z-three[0].z)-(three[1].z-three[0].z)*(three[2].x-three[0].x))<.04)continue;
      const plane=G.fitPlane(three);
      if(Math.hypot(plane.a,plane.b)>Math.tan(75*Math.PI/180))continue;
      const residuals=points.map(p=>Math.abs(p.y-G.planeY(plane,p.x,p.z)));
      const inliers=points.filter((p,i)=>residuals[i]<.22);
      const score=median(residuals);
      if(!best || inliers.length>best.inliers.length || (inliers.length===best.inliers.length && score<best.score))best={plane,inliers,score};
    }
    if(!best || best.inliers.length<8 || best.inliers.length/points.length<.55 || spatialCoverage(best.inliers)<.015) {
      return {error:'DSM does not support one dominant roof plane here. Split the outline at the ridge/dormer or check its position.'};
    }
    let plane=G.fitPlane(best.inliers),inliers=best.inliers;
    for(let i=0;i<3;i++) {
      const residuals=points.map(p=>Math.abs(p.y-G.planeY(plane,p.x,p.z)));
      const cutoff=Math.max(.12,Math.min(.3,2.8*median(residuals)));
      inliers=points.filter((p,j)=>residuals[j]<cutoff);
      if(inliers.length<8)break;
      plane=G.fitPlane(inliers);
    }
    if(inliers.length<8 || inliers.length/points.length<.55 || spatialCoverage(inliers)<.015)return {error:'Insufficient reliable DSM coverage after removing outliers.'};
    return {plane,inliers,total:points.length};
  }
  function solve(A,b) {
    const n=b.length,rows=A.map((r,i)=>[...r,b[i]]);
    const scale=Math.max(...A.map((r,i)=>Math.abs(r[i])),1);
    for(let c=0;c<n;c++) {
      let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(rows[r][c])>Math.abs(rows[pivot][c]))pivot=r;
      if(Math.abs(rows[pivot][c])<scale*1e-11)return null;
      [rows[c],rows[pivot]]=[rows[pivot],rows[c]];
      for(let r=c+1;r<n;r++){const k=rows[r][c]/rows[c][c];for(let j=c;j<=n;j++)rows[r][j]-=k*rows[c][j];}
    }
    const x=new Array(n).fill(0);
    for(let r=n-1;r>=0;r--){let s=rows[r][n];for(let j=r+1;j<n;j++)s-=rows[r][j]*x[j];x[r]=s/rows[r][r];}
    return x;
  }
  // Null-space elimination keeps shared corners exactly on every incident
  // fitted plane. Averaging independently fitted vertex heights would warp
  // polygons and recreate the triangular kinks this tool is meant to remove.
  function nullBasis(constraints,n) {
    const rows=constraints.map(r=>r.slice()),pivots=[];
    let row=0;
    for(let col=0;col<n && row<rows.length;col++) {
      let pivot=row;for(let r=row+1;r<rows.length;r++)if(Math.abs(rows[r][col])>Math.abs(rows[pivot][col]))pivot=r;
      if(Math.abs(rows[pivot][col])<1e-9)continue;
      [rows[row],rows[pivot]]=[rows[pivot],rows[row]];
      const d=rows[row][col];rows[row]=rows[row].map(v=>v/d);
      for(let r=0;r<rows.length;r++)if(r!==row){const k=rows[r][col];for(let c=0;c<n;c++)rows[r][c]-=k*rows[row][c];}
      pivots.push(col);row++;
    }
    const free=Array.from({length:n},(_,i)=>i).filter(i=>!pivots.includes(i));
    return free.map(col=>{const v=new Array(n).fill(0);v[col]=1;pivots.forEach((p,r)=>v[p]=-rows[r][col]);return v;});
  }
  function connections(faces) {
    const groups=[];
    E.stitch(faces).forEach((f,fi)=>f.ring.forEach(p=>{
      let group=groups.find(g=>Math.hypot(g.p.x-p.x,g.p.y-p.y,g.p.z-p.z)<1e-5);
      if(!group){group={p,faces:[]};groups.push(group);}
      if(!group.faces.includes(fi))group.faces.push(fi);
    }));
    return groups.filter(g=>g.faces.length>1);
  }
  function jointFit(indices,faces,locals,links) {
    const n=indices.length*3,index=new Map(indices.map((fi,i)=>[fi,i]));
    const centers=indices.map(fi=>G.polygonCentroid(faces[fi].ring.map(p=>[p.x,p.z])));
    const rowFor=(fi,p)=>{const row=new Array(n).fill(0),i=index.get(fi),[cx,cz]=centers[i];row[i*3]=p.x-cx;row[i*3+1]=p.z-cz;row[i*3+2]=1;return row;};
    const constraints=[];
    links.forEach(link=>{const incident=link.faces.filter(fi=>index.has(fi));if(incident.length<2)return;const first=rowFor(incident[0],link.p);incident.slice(1).forEach(fi=>constraints.push(first.map((v,j)=>v-rowFor(fi,link.p)[j])));});
    const basis=nullBasis(constraints,n),k=basis.length;
    const samples=indices.flatMap(fi=>{
      if(!locals[fi].error)return locals[fi].inliers.map(p=>({fi,p,row:rowFor(fi,p),weight:1}));
      // No invented DSM observations: preserve the old slope as a soft shape
      // prior. Height comes only from connected, observed faces. Exact shared
      // corners may require the slope to change; report this as guided geometry.
      const i=index.get(fi),old=G.fitPlane(faces[fi].ring);
      return [old.a,old.b].map((slope,axis)=>{
        const row=new Array(n).fill(0);row[i*3+axis]=1;
        return {fi,p:{y:slope},row,weight:1,prior:true};
      });
    });
    const design=samples.map(s=>basis.map(b=>b.reduce((sum,v,i)=>sum+v*s.row[i],0)));
    let weights=samples.map(s=>s.weight),parameters;
    for(let iteration=0;iteration<5;iteration++) {
      const A=Array.from({length:k},()=>new Array(k).fill(0)),b=new Array(k).fill(0);
      design.forEach((row,s)=>{const w=weights[s];for(let i=0;i<k;i++){b[i]+=w*row[i]*samples[s].p.y;for(let j=0;j<k;j++)A[i][j]+=w*row[i]*row[j];}});
      const solution=solve(A,b);if(!solution)return {error:'DSM samples cannot constrain these connected roof planes.'};
      parameters=new Array(n).fill(0);basis.forEach((v,i)=>v.forEach((x,j)=>parameters[j]+=x*solution[i]));
      const residuals=samples.map(s=>s.p.y-s.row.reduce((sum,v,i)=>sum+v*parameters[i],0));
      const sigma=Math.max(.08,1.4826*median(residuals.filter((r,i)=>!samples[i].prior).map(Math.abs)));
      weights=residuals.map((r,i)=>samples[i].prior?samples[i].weight:Math.min(1,1.5*sigma/Math.max(Math.abs(r),1e-9)));
    }
    const planes={};
    indices.forEach((fi,i)=>{const [cx,cz]=centers[i],a=parameters[i*3],b=parameters[i*3+1];planes[fi]={a,b,c:parameters[i*3+2]-a*cx-b*cz};});
    return {planes};
  }
  function refit(faces,dsm,site,selectedId=null) {
    const output=E.clone(faces),reports=[];
    if(!dsm || !dsm.grid)return {faces:output,reports:[{error:'Original DSM data is unavailable.'}],changed:false};
    const validation=E.validate(faces);
    if(validation.errors.length)return {faces:output,reports:[{error:'Fix the outline before refitting: '+validation.errors.join(' ')}],changed:false};
    const links=connections(faces),dsu=G.createDSU(faces.length);
    links.forEach(g=>g.faces.slice(1).forEach(fi=>dsu.union(g.faces[0],fi)));
    const selected=selectedId===null?null:faces.findIndex(f=>f.id===selectedId);
    if(selected===-1)return {faces:output,reports:[{error:'Choose a roof face.'}],changed:false};
    const components=new Map();
    faces.forEach((f,i)=>{const root=dsu.find(i);if(selected!==null && root!==dsu.find(selected))return;if(!components.has(root))components.set(root,[]);components.get(root).push(i);});
    let changed=false;
    components.forEach(indices=>{
      const locals={};indices.forEach(fi=>{const points=samplesFor(faces[fi],dsm,site);locals[fi]={...localFit(points),total:points.length};});
      const failed=indices.filter(fi=>locals[fi].error);
      if(failed.length===indices.length){reports.push({error:'No reliable DSM plane in this roof group ('+indices.length+' faces). Too few reliable, well-spread samples or multiple slopes. Your geometry is unchanged; use photos or measured heights to set its shape.'});return;}
      const fit=jointFit(indices,faces,locals,links);
      if(fit.error){reports.push({error:fit.error});return;}
      const metrics=indices.map(fi=>{
        const plane=fit.planes[fi],points=locals[fi].inliers||[],old=G.fitPlane(faces[fi].ring);
        const rmse=pl=>points.length?Math.sqrt(points.reduce((s,p)=>s+(p.y-G.planeY(pl,p.x,p.z))**2,0)/points.length):null;
        return {id:faces[fi].id,name:faces[fi].name,status:locals[fi].error?'guided':'dsm',reason:locals[fi].error||null,pitchChange:(Math.atan(Math.hypot(plane.a,plane.b))-Math.atan(Math.hypot(old.a,old.b)))*180/Math.PI,maxHeightChange:Math.max(...faces[fi].ring.map(p=>Math.abs(p.y-G.planeY(plane,p.x,p.z)))),samples:locals[fi].total,inliers:points.length,before:rmse(old),after:rmse(plane),pitch:Math.atan(Math.hypot(plane.a,plane.b))*180/Math.PI};
      });
      if(metrics.some(m=>m.after>.35 || m.pitch>75)) {reports.push({error:'Shared corners conflict with the DSM planes (residual over 0.35 m or excessive pitch). Check the traced ridge/valley positions; this group was left unchanged.'});return;}
      const trial=E.clone(output);
      indices.forEach(fi=>trial[fi].ring.forEach(p=>p.y=G.planeY(fit.planes[fi],p.x,p.z)));
      const validation=E.validate(trial);
      if(validation.errors.length){reports.push({error:'Refit would create invalid geometry: '+validation.errors.join(' ')});return;}
      indices.forEach(fi=>output[fi]=trial[fi]);changed=true;reports.push(...metrics);
    });
    return {faces:output,reports,changed};
  }
  return {samplesFor,localFit,refit};
});
