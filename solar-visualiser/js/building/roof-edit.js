// Manual roof corrections. Pure, property-centred metres (X east, Z south,
// Y above site ground), never DSM/scene coordinates. Source data is immutable.
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./geometry.js'), require('./solid.js'));
  else root.SolarViz.roofEdit = factory(root.SolarViz.buildingGeometry, root.SolarViz.buildingSolid);
})(typeof window !== 'undefined' ? window : globalThis, function (G, S) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const samePoint = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z) < 1e-5;
  function propertyFrame(site) {
    const addr = site.property_details.geocoded_address, lat = addr.latitude*Math.PI/180;
    const mx = Math.PI/180*6378137*Math.cos(lat);
    const mz = 111132.954-559.822*Math.cos(2*lat)+1.175*Math.cos(4*lat);
    return { point: p => ({x:(p[0]-addr.longitude)*mx, z:-(p[1]-addr.latitude)*mz, y:p[2]-site.property_details.altitude}) };
  }
  function baseFaces(site) {
    const frame = propertyFrame(site);
    const solid = S.buildSolid(site.roof_faces.map(f => ({id:f.id,active:f.solar_arrays[0].active,ring:f.geometry.coordinates[0].map(frame.point)})), {groundY:0});
    if (!solid) throw new Error('Cannot prepare roof geometry for editing');
    return solid.faces.map((f,i) => ({id:f.id,name:'Detected roof '+(i+1),active:f.active,
      ring:f.ids.map((id,j) => {const c=solid.clusters[id];return {id:f.id+':'+j,x:c.x,y:c.y,z:c.z};})}));
  }
  function resolve(base, edits) {
    if (!edits) return clone(base);
    if (edits.version !== 1 || !Array.isArray(edits.added) || !Array.isArray(edits.deleted) || !edits.replaced) throw new Error('Invalid roof corrections');
    return base.filter(f=>!edits.deleted.includes(f.id)).map(f=>clone(edits.replaced[f.id] || f)).concat(clone(edits.added));
  }
  function sameFace(a,b) {
    return a.id===b.id && a.name===b.name && a.active===b.active && a.ring.length===b.ring.length &&
      a.ring.every((p,i)=>p.id===b.ring[i].id && Math.hypot(p.x-b.ring[i].x,p.y-b.ring[i].y,p.z-b.ring[i].z)<1e-7);
  }
  function diff(base, faces) {
    const original = new Map(base.map(f=>[f.id,f]));
    return { version:1, replaced:Object.fromEntries(faces.filter(f=>original.has(f.id) && !sameFace(f,original.get(f.id))).map(f=>[f.id,clone(f)])),
      added:clone(faces.filter(f=>!original.has(f.id))), deleted:base.filter(f=>!faces.some(x=>x.id===f.id)).map(f=>f.id) };
  }
  function changed(edits) { return !!edits && (!!edits.added.length || !!edits.deleted.length || !!Object.keys(edits.replaced).length); }
  function build(faces, origin) {
    origin = origin || {x:0,y:0,z:0};
    return S.buildSolid(stitch(faces).map(f=>({id:f.id,active:f.active,ring:f.ring.map(p=>({x:p.x+origin.x,y:p.y+origin.y,z:p.z+origin.z}))})),
      {groundY:origin.y,snapTol:1e-5,eaveTol:0,orthogonalize:false,straightenDeg:0,preserveVertices:true});
  }
  function stitch(faces) {
    const points=faces.flatMap(f=>f.ring);
    return faces.map(f=>Object.assign({},f,{ring:f.ring.flatMap((a,i)=>{
      const b=f.ring[(i+1)%f.ring.length],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz;
      const cuts=[];
      points.forEach(p=>{const t=((p.x-a.x)*dx+(p.y-a.y)*dy+(p.z-a.z)*dz)/length;
        if(t>1e-5 && t<1-1e-5 && Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy,p.z-a.z-t*dz)<1e-5 && !cuts.some(c=>Math.abs(c.t-t)<1e-5))cuts.push({t,p});});
      return [a,...cuts.sort((a,b)=>a.t-b.t).map(c=>c.p)];
    })}));
  }
  const cross = (a,b,c) => (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  // Triangle clipping gives overlap area for concave outlines as well as
  // rectangles. A low roof drawn underneath another roof is still an overlap
  // of the extruded building volumes, even when their roof heights differ.
  function overlapArea(a,b) {
    let area=0;
    const side=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
    for(const at of G.triangulatePolygon(a)) for(const bt of G.triangulatePolygon(b)) {
      let polygon=at.map(i=>a[i]);
      const triangle=bt.map(i=>b[i]),sign=G.polygonArea(triangle)>0?1:-1;
      for(let edge=0;edge<3;edge++) {
        const input=polygon;polygon=[];
        const q=triangle[edge],r=triangle[(edge+1)%3];
        input.forEach((x,i)=>{
          const y=input[(i+1)%input.length],dx=sign*side(q,r,x),dy=sign*side(q,r,y);
          if(dx>=0)polygon.push(x);
          if((dx>=0)!==(dy>=0)) {
            const t=dx/(dx-dy);
            polygon.push([x[0]+t*(y[0]-x[0]),x[1]+t*(y[1]-x[1])]);
          }
        });
      }
      area+=Math.abs(G.polygonArea(polygon));
    }
    return area;
  }
  function validate(faces) {
    const errors = [], warnings = [];
    if (!faces.length) return {errors:['Keep at least one roof face.'],warnings,solid:null};
    const ids = new Set();
    faces.forEach(f=>{
      const label = f.name || 'Roof';
      if (!f.id || ids.has(f.id)) errors.push('Each roof face needs a unique ID.');
      ids.add(f.id);
      if (!Array.isArray(f.ring) || f.ring.length < 3) {errors.push(label+': add at least three corners.');return;}
      if (f.ring.some(p=>![p.x,p.y,p.z].every(Number.isFinite) || p.y <= 0 || p.y>100 || Math.abs(p.x)>1000 || Math.abs(p.z)>1000)) {
        errors.push(label+': use finite positions and heights above ground (up to 100 m).');return;
      }
      const poly = f.ring.map(p=>[p.x,p.z]);
      if (Math.abs(G.polygonArea(poly)) < .02) errors.push(label+': the outline has no usable area.');
      const n=f.ring.length;
      for(let i=0;i<n;i++) {
        const a=f.ring[i],b=f.ring[(i+1)%n];
        if(Math.hypot(a.x-b.x,a.z-b.z)<.01) errors.push(label+': remove duplicate corners.');
        for(let j=i+2;j<n;j++) {
          if(i===0 && j===n-1) continue;
          const c=f.ring[j],d=f.ring[(j+1)%n];
          if(cross(a,b,c)*cross(a,b,d)<-1e-10 && cross(c,d,a)*cross(c,d,b)<-1e-10) errors.push(label+': outline edges cross.');
        }
      }
      const plane=G.fitPlane(f.ring);
      const residual=Math.max(...f.ring.map(p=>Math.abs(p.y-G.planeY(plane,p.x,p.z))));
      if(residual>.04) warnings.push(label+': corners deviate '+residual.toFixed(2)+' m from a plane. Adjust pitch/heights or triangulate this face.');
    });
    if(errors.length) return {errors,warnings,solid:null};
    for(let i=0;i<faces.length;i++) for(let j=i+1;j<faces.length;j++) {
      const area=overlapArea(faces[i].ring.map(p=>[p.x,p.z]),faces[j].ring.map(p=>[p.x,p.z]));
      // The regularised source can contain centimetre-scale slivers; report
      // material overlaps without blocking untouched detection data.
      if(area>.05)errors.push(faces[i].name+' overlaps '+faces[j].name+' by '+area.toFixed(2)+' m². Trim or redraw the faces.');
    }
    const solid=build(faces);
    if(!solid || !solid.watertight.closed || !solid.watertight.oriented) errors.push('These faces do not form a closed, consistently oriented building. Check touching edges and overlapping outlines.');
    // Every preview point must survive unchanged; automatic regularisation
    // must not silently move a measured corner during Apply.
    if(solid) faces.forEach(f=>f.ring.forEach(p=>{
      if(!solid.clusters.some(c=>samePoint(p,c))) errors.push('A corner was lost while building the roof.');
    }));
    return {errors:[...new Set(errors)],warnings,solid};
  }
  function moveCorner(faces, faceId, index, point, linked) {
    const result=clone(faces),old=faces.find(f=>f.id===faceId).ring[index];
    result.forEach(f=>f.ring.forEach((p,i)=>{
      if((f.id===faceId && i===index) || (linked && samePoint(p,old))) Object.assign(p,point);
    }));
    return result;
  }
  function splitFace(face, a, b, newId) {
    const n=face.ring.length;
    if(a>b) [a,b]=[b,a];
    if(a===b || b-a===1 || b-a===n-1) throw new Error('Choose two non-adjacent corners.');
    const ring1=face.ring.slice(a,b+1),ring2=face.ring.slice(b).concat(face.ring.slice(0,a+1));
    // Reject diagonals outside a concave outline.
    const p=face.ring[a],q=face.ring[b],poly=face.ring.map(v=>[v.x,v.z]);
    for(let t=.1;t<1;t+=.1) if(!G.pointInPolygon(poly,p.x+(q.x-p.x)*t,p.z+(q.z-p.z)*t)) throw new Error('The split must stay inside the roof face.');
    return [Object.assign(clone(face),{ring:clone(ring1)}),Object.assign(clone(face),{id:newId,name:face.name+' — split',ring:clone(ring2)})];
  }
  function invalidateMatches(state) {
    state.roofRevision=(state.roofRevision || 0)+1;
    Object.values(state.photoMatches || {}).forEach(m=>{
      m.roofNeedsReview=true; // retain old clicks for audit, never reuse their indices
      if(m.landmarks && m.landmarks.length)m.previousLandmarks=clone(m.landmarks);
      m.landmarks=[];
      m.pose=null;
    });
  }
  return {clone,propertyFrame,baseFaces,resolve,diff,changed,stitch,build,validate,moveCorner,splitFace,invalidateMatches};
});
