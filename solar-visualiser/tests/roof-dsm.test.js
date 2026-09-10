const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const D=require('../js/building/roof-dsm.js'),E=require('../js/building/roof-edit.js'),G=require('../js/building/geometry.js');
const site={property_details:{altitude:40,geocoded_address:{easting:1000,northing:2000}}};
const face=(id,x0,z0,x1,z1,height=5)=>({id,name:id,active:true,ring:[[x0,z0],[x1,z0],[x1,z1],[x0,z1]].map(([x,z],i)=>({id:id+':'+i,x,z,y:height}))});
function raster(fn,x0=-10,z0=-10,cell=.25,ncols=100,nrows=100){
 const grid=new Float64Array(ncols*nrows);
 for(let r=0;r<nrows;r++)for(let c=0;c<ncols;c++)grid[r*ncols+c]=40+fn(x0+(c+.5)*cell,z0+(r+.5)*cell,r,c);
 return {grid,ncols,nrows,cellsize:cell,xll:1000+x0,yll:2000-z0-nrows*cell,nodata:-9999};
}
const near=(a,b,msg)=>assert(Math.abs(a-b)<1e-6,msg+': '+a+' vs '+b);
function checkPlanar(faces){for(const f of faces){const p=G.fitPlane(f.ring);for(const v of f.ring)near(v.y,G.planeY(p,v.x,v.z),'Planar face');}assert.deepEqual(E.validate(faces).errors,[]);}
const roof=face('main',0,0,6,8),plane=(x,z)=>6+.3*x-.2*z;
roof.ring[1].y=8;
const original=JSON.stringify(roof),dsm=raster(plane),raw=Array.from(dsm.grid);
const fitted=D.refit([roof],dsm,site);
assert(fitted.changed);checkPlanar(fitted.faces);
for(const p of fitted.faces[0].ring)near(p.y,plane(p.x,p.z),'Recovers sloped plane');
assert.equal(JSON.stringify(roof),original,'Source faces unchanged');assert.deepEqual(Array.from(dsm.grid),raw,'Original DSM unchanged');
assert.deepEqual(fitted.faces[0].ring.map(p=>[p.id,p.x,p.z]),roof.ring.map(p=>[p.id,p.x,p.z]),'Plan and vertex identities unchanged');
const shifted=D.refit([roof],raster(plane,-12,-14,.25,120,130),site);
assert(shifted.changed);for(let i=0;i<4;i++)near(shifted.faces[0].ring[i].y,fitted.faces[0].ring[i].y,'Independent of DSM crop origin');
// Every fifth cell is an obstruction and every seventh is absent.
const noisy=raster((x,z,r,c)=>(r+c)%7===0?-10039:plane(x,z)+((r+c)%5===0?4:0));
const robust=D.refit([roof],noisy,site);assert(robust.changed);for(const p of robust.faces[0].ring)near(p.y,plane(p.x,p.z),'Reject spikes and nodata');
assert(robust.reports[0].inliers<robust.reports[0].samples);
const west=face('west',0,0,4,8,5),east=face('east',4,0,8,8,5),extension=face('extension',8,0,12,8,3);
const gable=(x,z)=>x<8?8-.5*Math.abs(x-4):3+.1*(x-8);
const joined=[west,east,extension],before=JSON.stringify(joined);
const selected=D.refit(joined,raster(gable),site,'west');assert(selected.changed);checkPlanar(selected.faces);
assert.deepEqual(selected.faces[2],extension,'Lower extension excluded from selected connected group');
assert.equal(selected.reports.length,2);
for(const f of selected.faces.slice(0,2))for(const p of f.ring)near(p.y,8-.5*Math.abs(p.x-4),'Connected gable height');
const all=D.refit(joined,raster(gable),site);assert(all.changed);checkPlanar(all.faces);
for(const p of all.faces[2].ring)near(p.y,3+.1*(p.x-8),'Independent lower extension fit');
assert.equal(JSON.stringify(joined),before);
assert.deepEqual(E.resolve(joined,JSON.parse(JSON.stringify(E.diff(joined,all.faces)))) ,all.faces,'Persist only user edits, exact replay');
assert(E.build(all.faces).watertight.closed && E.build(all.faces).watertight.oriented);
// Three tiny joined faces must not prevent a well-observed main roof fitting.
const mixed=[face('large',0,0,6,8),face('dormer-a',6,2,6.5,3),face('dormer-b',6,3,6.5,4),face('dormer-c',6.5,2,7,3)];
const mixedBefore=JSON.stringify(mixed),mixedDSM=raster(plane);
const guided=D.refit(mixed,mixedDSM,site);
assert(guided.changed,'Sparse dormers no longer block the entire roof');checkPlanar(guided.faces);
assert.equal(guided.reports.filter(r=>r.status==='dsm').length,1);
assert.equal(guided.reports.filter(r=>r.status==='guided').length,3);
assert(guided.reports[0].after<.01,'Existing dormer slopes cannot overwhelm the observed main roof');
for(const r of guided.reports.slice(1)){assert.equal(r.after,null,'No synthetic fit accuracy for inferred faces');assert.equal(r.inliers,0);assert(r.reason);assert(Number.isFinite(r.pitchChange));}
assert.equal(JSON.stringify(mixed),mixedBefore,'Guided fitting leaves originals intact');
assert.deepEqual(E.resolve(mixed,JSON.parse(JSON.stringify(E.diff(mixed,guided.faces)))),guided.faces);
const selectedTiny=D.refit(mixed,mixedDSM,site,'dormer-c');
assert.deepEqual(selectedTiny.faces,guided.faces,'Selecting a tiny face uses support throughout its joined group');
const isolated=face('isolated',10,10,10.5,10.5);
const partial=D.refit([...mixed,isolated],mixedDSM,site);
assert(partial.changed);assert.deepEqual(partial.faces[4],isolated,'Unobserved disconnected face is never anchored to a different roof');
assert(partial.reports.some(r=>r.error));
const absent=raster(()=>-10039),noEvidence=D.refit(mixed,absent,site);
assert.equal(noEvidence.changed,false);assert.deepEqual(noEvidence.faces,mixed);assert.equal(noEvidence.reports.length,1,'One clear group message rather than repeated errors');
// A deliberately misplaced ridge cannot satisfy both observed roof slopes.
const badRidge=[face('west',0,0,2,8),face('east',2,0,8,8)];
const rejected=D.refit(badRidge,raster((x,z)=>10-Math.abs(x-4)),site);
assert.equal(rejected.changed,false,'Reject incompatible fixed ridge');assert.deepEqual(rejected.faces,badRidge);
assert(rejected.reports.some(r=>r.error));
for(const small of [face('tiny',0,0,.5,.5),face('thin',0,0,.7,8),face('outside',50,50,55,55)]){
 const r=D.refit([small],dsm,site);assert.equal(r.changed,false);assert.deepEqual(r.faces,[small]);assert(r.reports[0].error.includes('samples'));
}
assert(D.localFit(Array.from({length:20},(_,i)=>({x:i,z:0,y:4}))).error,'Collinear samples cannot constrain slope');
assert.equal(D.refit([roof],null,site).changed,false);
assert.equal(D.refit([roof],dsm,site,'missing').changed,false);
const invalid=E.clone(roof);[invalid.ring[1],invalid.ring[2]]=[invalid.ring[2],invalid.ring[1]];
assert.equal(D.refit([invalid],dsm,site).changed,false);
for(const file of ['data/site-data.js','3broomroad-data/property-bundle.js']){
 const ctx={window:{},atob};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),ctx);
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../js/coordinates.js'),'utf8'),ctx);
 const w=ctx.window,meta=w.__DSM_META__||{ncols:400,nrows:400,cellsize:.25,xll:485562,yll:106428,nodata:-9999};
 const data=w.SolarViz.coordinates.decodeDSM(w.__DSM_B64__,meta),base=E.baseFaces(w.SITE_DATA),saved=JSON.stringify(base);
 const r=D.refit(base,data,w.SITE_DATA);
 assert.equal(JSON.stringify(base),saved);
 assert.deepEqual(E.validate(r.faces).errors,[]);
 if(file.includes('3broomroad')){assert(r.changed);assert.equal(r.reports.length,3);assert(r.reports.every(p=>p.after<.2));checkPlanar(r.faces);}
 console.log('  ok  '+file+': '+r.reports.map(p=>p.error||p.name+' '+p.after.toFixed(3)+' m').join('; '));
}
console.log('all checks passed');
