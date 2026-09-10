const assert=require('node:assert/strict'),G=require('../js/building/geometry.js'),P=require('../js/building/plan-geometry.js'),E=require('../js/building/roof-edit.js'),F=require('../js/building/floors.js'),R=require('../js/building/rooms.js'),H=require('../js/building/heat-loss.js'),B=require('../js/building/building-project.js'),O=require('../js/building/openings.js');
const near=(a,b,e=1e-5)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const rect=(a,b,c,d)=>[[a,b],[c,b],[c,d],[a,d]];
near(P.area(P.unionLoops([rect(0,0,2,3),rect(2,0,4,3)])),12);assert.equal(P.unionLoops([rect(0,0,2,3),rect(2,0,4,3)]).length,1);
near(P.area(P.unionLoops([rect(0,0,3,3),rect(2,0,4,3)])),12);assert.equal(P.unionLoops([rect(0,0,1,1),rect(3,0,4,1)]).length,2);
const solid=E.build([{id:'roof',active:true,ring:[[0,3,0],[4,3,0],[4,3,4],[0,3,4]].map(([x,y,z])=>({x,y,z}))}]);const levels=F.computeFloors(solid,{count:1,storeyHeight:3,slabT:0,includeAttic:false});const rooms={0:R.deriveRooms(levels[0].outline,[[[2,0],[2,4]]]).rooms.map((r,i)=>({...r,name:'Room '+i}))};
let geometry=H.derive({solid,levels,roomsByLevel:rooms,windows:[{id:'window',kind:'window',ring:[[1,1,0],[3,1,0],[3,2,0],[1,2,0]]}]});
near(geometry.rooms.reduce((s,r)=>s+r.volume,0),48);near(geometry.surfaces.filter(s=>s.kind==='wall'&&!s.roomB).reduce((s,r)=>s+r.grossArea,0),48);
near(geometry.surfaces.reduce((s,r)=>s+r.openingArea,0),2);assert.equal(geometry.surfaces.filter(s=>s.roomB).length,1);near(geometry.surfaces.find(s=>s.roomB).grossArea,12);
assert.equal(H.calculate(geometry,{}).totalW,null);assert(H.calculate(geometry,{}).rooms.every(r=>r.netLoadW===null));
const inputs={outsideTemperature:0,coverageReviewed:true,rooms:{},surfaces:{}};geometry.rooms.forEach((r,i)=>inputs.rooms[r.id]={temperature:i?18:21,ach:.5,bridgeWPerK:0,basis:'assumed',reviewedSignature:geometry.signature});geometry.surfaces.forEach(s=>inputs.surfaces[s.id]={boundary:'outside',uValue:1,openingU:{window:2}});
let result=H.calculate(geometry,inputs);assert(result.totalW>0);near(result.rooms.reduce((s,r)=>s+r.internalExchangeW,0),0);near(result.rooms.reduce((s,r)=>s+r.netLoadW,0),result.totalW);
const before=JSON.stringify(inputs);H.calculate(geometry,inputs);assert.equal(JSON.stringify(inputs),before,'Calculation is pure');
const s=geometry.surfaces.find(s=>s.openingArea);inputs.surfaces[s.id].area=.2;assert.equal(H.calculate(geometry,inputs).totalW,null,'Oversized openings block calculation');delete inputs.surfaces[s.id].area;
inputs.rooms[geometry.rooms[0].id].reviewedSignature='stale';assert.equal(H.calculate(geometry,inputs).rooms[0].netLoadW,null,'Changed geometry invalidates quantity review');
const two=F.computeFloors(solid,{count:2,storeyHeight:1.5,slabT:0,includeAttic:false});const vertical=H.derive({solid,levels:two,roomsByLevel:Object.fromEntries(two.map(l=>[l.idx,[{id:'r',poly:l.outline}]]))});near(vertical.rooms.reduce((s,r)=>s+r.volume,0),48);near(vertical.surfaces.filter(s=>s.kind==='interfloor').reduce((n,s)=>n+s.grossArea,0),16);
const report=require('../3broomroad-data/reconstruction/run.json'),site=require('../3broomroad-data/solarpotential.json');const old={version:1,storeys:{count:2},settings:{},floors:{0:{dividers:[],roomNames:{r:'old'}}},windows:[],radiators:[],photoMatches:{},thermal:{test:'preserve'}};const oldJSON=JSON.stringify(old),adopted=B.adopt(old,report,E.baseFaces(site),'3broomroad');assert.equal(JSON.stringify(old),oldJSON);assert.equal(adopted.reconstructionBackup.thermal.test,'preserve');assert.throws(()=>B.adopt(old,report,E.baseFaces(site),'another-house'),/another property/);
const stage=B.candidate(report,'3broomroad'),candidateSolid=E.build(stage.worldFaces),floors=F.computeFloors(candidateSolid,{count:2,storeyHeight:2.8,slabT:.2,includeAttic:false});assert.equal(floors[0].loops.length,1,'Connected extension participates in room editing');
const imported=B.bindOpenings(adopted.pendingCandidateOpenings,candidateSolid,floors,{x:0,y:0,z:0});assert.equal(imported.bound.length+imported.unbound.length,stage.model.openings.length);const door=imported.bound.find(o=>o.sourceId==='rear-door');assert(door);const box=O.windowRect(door,candidateSolid,floors);assert(Math.abs(box.ring[0][1]-box.ring[1][1])>.2);const copy=JSON.stringify(door);assert(O.clampWindow(door,candidateSolid,floors));assert.equal(JSON.stringify(door),copy,'Imported polygon keeps its fitted shape');
console.log('all heat-loss/project checks passed: union floors, opening allocation, room exchange, unknown/stale gates, provenance and sloped frame');

// Absolute reference: each 8 m² room has 24 m² outside walls + 8 floor + 8 ceiling,
// one m² of glazing replaces opaque wall. UA=41 W/K, volume=24 m³.
near(result.totalW,(41+.33*.5*24)*(21+18));
// Midpoint-inside is insufficient for a cut through a narrow concave recess.
const notched=[[0,0],[2,0],[2,2],[3,2],[3,0],[10,0],[10,5],[0,5]];
assert.equal(G.splitPolygonByPolyline(notched,[[0,1],[10,1]]),null);
// Real Broom divisions must conserve floor/roof coverage and plausible room volumes.
const outline=floors[0].outline;let partition;
for(let i=2;i<outline.length-1;i++){const p=R.deriveRooms(outline,[[outline[0],outline[i]]]);if(!p.failed.length&&p.rooms.length>1){partition=p.rooms;break;}}
assert(partition);const quantities=H.derive({solid:candidateSolid,levels:floors,roomsByLevel:{0:partition}});
for(const r of quantities.rooms){assert.deepEqual(r.geometryIssues,[]);assert(r.volume<=r.floorArea*2.6+.01);}
const overlapping={...solid,faces:[...solid.faces,...solid.faces]};
const bad=H.derive({solid:overlapping,levels,roomsByLevel:rooms});assert(bad.rooms.every(r=>r.geometryIssues.length));assert.equal(H.calculate(bad,inputs).totalW,null);
console.log('quantity conservation and concave-divider regressions passed');
// Saved thermal identities use the property frame, independent of scene translation.
const offset={x:120,y:34,z:-80},moved=E.build([{id:'roof',active:true,ring:[[0,3,0],[4,3,0],[4,3,4],[0,3,4]].map(([x,y,z])=>({x,y,z}))}],offset);
const movedLevels=F.computeFloors(moved,{count:1,storeyHeight:3,slabT:0,includeAttic:false});
const movedGeometry=H.derive({solid:moved,levels:movedLevels,origin:offset,roomsByLevel:{0:rooms[0].map(r=>({...r,poly:r.poly.map(p=>[p[0]+offset.x,p[1]+offset.z])}))},windows:[{id:'window',kind:'window',ring:[[1,1,0],[3,1,0],[3,2,0],[1,2,0]].map(p=>[p[0]+offset.x,p[1]+offset.y,p[2]+offset.z])}]});
assert.equal(movedGeometry.signature,geometry.signature);
console.log('property-frame thermal identity passed');

const unknownOpening=JSON.parse(JSON.stringify(inputs));
geometry.rooms.forEach(r=>unknownOpening.rooms[r.id].reviewedSignature=geometry.signature);
const boundaryId=geometry.surfaces.find(s=>!s.roomB).id;
unknownOpening.surfaces[boundaryId]={boundary:'adiabatic',extraOpenings:[{id:'unknown',area:null,uValue:null}]};
const unknownResult=H.calculate(geometry,unknownOpening);
assert.equal(unknownResult.totalW,null);
assert.equal(unknownResult.rooms.flatMap(r=>r.surfaces).find(s=>s.id===boundaryId).watts,null);
