const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const appRoot=path.resolve(__dirname,'..'),testTmp=process.env.REVIEW_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'broom-review-'));
if(!process.env.REVIEW_CDP_URL)throw Error('Run via node tests/browser-review.cjs');
(async()=>{
 const ws=new WebSocket(process.env.REVIEW_CDP_URL); await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result)} else if(d.method==='Runtime.exceptionThrown'||(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error'))errors.push(d.params)};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params,sessionId}))});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});const call=(m,p)=>send(m,p,sessionId);
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 const evalJS=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};

 const assert=require('node:assert/strict');const downloadPath=fs.mkdtempSync(path.join(testTmp,'downloads-'));await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath});

 const ready=async()=>{for(let i=0;i<150;i++){if(await evalJS('!!window.__SOLAR_VIZ__?.building'))return;await new Promise(r=>setTimeout(r,100))}throw Error('App load timeout: '+JSON.stringify(errors));};
 for(const root of [process.env.REVIEW_HTTP_URL,pathToFileURL(appRoot).href]){
  await call('Page.navigate',{url:root+'/index.html?property=3broomroad&mode=ashp'});await ready();
  await evalJS(`document.getElementById('bm-adopt-reconstruction').click()`);
  assert.equal(await evalJS('!!document.getElementById("bm-confirm-adopt")'),false,'Initial build maps rooms without a confirmation/import sequence');
  assert.equal(await evalJS('__SOLAR_VIZ__.building.state.automaticRooms.status'),'mapped');
  assert.deepEqual(await evalJS('Object.values(__SOLAR_VIZ__.building.roomsByLevel).map(r=>r.length)'),[3,5,5]);
  assert.equal(await evalJS('document.querySelectorAll("[data-workspace-panel]:not([hidden])").length'),1);
  assert.equal(await evalJS('document.querySelector("[data-workspace-panel]:not([hidden])").dataset.workspacePanel'),'house');
  await evalJS(`document.getElementById('workspace-survey').click();document.getElementById('bm-survey-review').click()`);
  assert.equal(await evalJS('document.getElementById("gp-tab-survey").classList.contains("selected")'),true);
  await evalJS(`document.getElementById('gp-close').click();document.getElementById('workspace-house').click()`);
  assert.equal(await evalJS('__SOLAR_VIZ__.building.state.geometrySource.stageId'),'rear-openings');
  assert.equal(await evalJS('__SOLAR_VIZ__.building.levels[0].loops.length'),1);
  await evalJS(`document.getElementById('bm-flatten').checked=false;document.getElementById('bm-flatten').dispatchEvent(new Event('change'))`);
  assert.equal(await evalJS('__SOLAR_VIZ__.terrainMesh.geometry===__SOLAR_VIZ__.terrainMesh.userData.rawDSMGeometry'),true,'Uncut ASHP context is the original DSM, not the solar roof cap');
  await evalJS(`document.getElementById('bm-flatten').checked=true;document.getElementById('bm-flatten').dispatchEvent(new Event('change'))`);
  assert.equal(await evalJS('__SOLAR_VIZ__.building.state.windows.some(w=>w.sourceId==="rear-door"&&w.profile.length===4)'),true);
  assert.equal(await evalJS('__SOLAR_VIZ__.building.state.windows.length+__SOLAR_VIZ__.building.state.unboundCandidateOpenings.length'),16);
  await evalJS(`window.bb=__SOLAR_VIZ__.building;window.prepApi=__SOLAR_VIZ__.geometryPrep;window.gg=prepApi.derive()`);
  assert.deepEqual(await evalJS('gg.coverageIssues'),[]);
  assert.equal(await evalJS('gg.rooms.length'),13);
  assert.equal(await evalJS('gg.surfaces.filter(s=>s.boundaryHypothesis==="party").reduce((n,s)=>n+s.netArea,0)>110'),true,'Main party walls classified in property frame');
  assert.equal(await evalJS('SolarViz.geometryPrep.review(gg,SolarViz.geometryPrep.empty("3broomroad",gg.signature)).surfaces.some(s=>s.current.boundary==="party")'),true,'Review displays party defaults without a manual action');
  assert.equal(await evalJS("['main-rear-lower','main-rear-upper'].every(id=>bb.state.windows.some(w=>w.sourceId===id))"),true,'Both photo-observed rear windows bind to ASHP walls');
  assert.equal(await evalJS('gg.rooms.every(r=>r.volume>0)'),true);
  await evalJS(`window.beforeRebuild=JSON.stringify(bb.state);document.getElementById('bm-adopt-reconstruction').click()`);
  assert.equal(await evalJS('JSON.stringify(bb.state)===beforeRebuild'),true);
  await evalJS(`document.getElementById('bm-cancel-adopt').click()`);
  await evalJS(`document.getElementById('bm-roof-edit').click()`);
  assert.equal(await evalJS('document.querySelectorAll("#re-face option").length'),8,'The normal roof editor receives the candidate faces');
  assert.equal(await evalJS('document.getElementById("re-apply").disabled'),false);
  await evalJS(`document.getElementById('re-cancel').click();document.getElementById('bm-terrain').click();const c=bb.origin;__SOLAR_VIZ__.camera.position.set(c.x-17,c.y+15,c.z+17);__SOLAR_VIZ__.controls.target.set(c.x-3,c.y+3,c.z);__SOLAR_VIZ__.controls.update();`);
  await new Promise(r=>setTimeout(r,1000));
  fs.writeFileSync(path.join(testTmp,'ashp-adopted-exterior.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));

  // Split a floor, then edit remote quantity estimates and a boundary through the UI.
  await evalJS(`window.poly=bb.levels[0].outline;window.divided=false;for(let i=2;i<poly.length-1;i++){try{bb.updateRoomLayout(0,[[poly[0],poly[i]]]);if(bb.roomsByLevel[0].length>1){divided=true;break;}}catch(e){}}if(!divided)throw Error('No test divider');bb.renameRoom(0,bb.roomsByLevel[0][0].id,'Kitchen');bb.save();document.getElementById('bm-geometry-prep').click();document.getElementById('gp-rebase')?.click();window.change=(label,value)=>{const input=[...document.querySelectorAll('#geometry-prep-dialog label')].find(l=>l.firstChild.textContent===label)?.querySelector('input,select');if(!input)throw Error('Missing field '+label);input.value=value;input.dispatchEvent(new Event('change'));};change('Internal floor area estimate (m²)',20);change('Mean clear height estimate (m)',2.6);change('Heated status','heated');change('Boundary type','party');change('Boundary evidence','Shared wall shown on plan; remote hypothesis');`);
  assert.match(await evalJS('document.getElementById("gp-summary").textContent'),/Remote geometry draft/);
  assert.equal(await evalJS('document.querySelector("#geometry-prep-dialog").textContent.includes("U-value")'),false);
  assert.equal(await evalJS('document.querySelector("#geometry-prep-dialog").textContent.includes("ACH")'),false);
  await evalJS(`document.getElementById('gp-checkpoint').click();document.getElementById('gp-tab-plan').click()`);
  assert.equal(await evalJS('document.querySelectorAll(".gp-table tr").length'),13);
  fs.writeFileSync(path.join(testTmp,'geometry-prep-plan.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  assert.equal(await evalJS('document.querySelector("#geometry-prep-dialog img").src.startsWith("data:image/")'),true);
  await evalJS(`document.getElementById('gp-tab-survey').click()`);
  assert.equal(await evalJS('!!document.getElementById("gp-survey-form")'),true);
  assert.match(await evalJS('document.querySelector(".gp-task").textContent'),/basement/);
  fs.writeFileSync(path.join(testTmp,'geometry-prep-survey.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`change('Measured field','height');document.getElementById('gp-value').value=2.8;document.getElementById('gp-observer').value='Test surveyor';document.getElementById('gp-method').value='Laser, three positions';document.getElementById('gp-reference').value='Survey sketch A';if(!document.getElementById('gp-survey-form').checkValidity())throw Error('Survey form invalid');document.getElementById('gp-survey-form').requestSubmit();`);
  const reviewExpr='SolarViz.geometryPrep.review(__SOLAR_VIZ__.geometryPrep.derive(),__SOLAR_VIZ__.building.state.geometryPrep)';
  assert.equal(await evalJS(reviewExpr+'.rooms[0].current.height'),2.6,'Observation awaits acceptance');
  await evalJS(`document.querySelector('[data-accept-event]').click()`);
  assert.equal(await evalJS(reviewExpr+'.rooms[0].current.height'),2.8);assert.equal(await evalJS(reviewExpr+'.rooms[0].current.volume'),56);assert.equal(await evalJS(reviewExpr+'.rooms[0].remote.height'),2.6);
  assert.match(await evalJS('document.getElementById("gp-summary").textContent'),/Site-refined quantities/);
  await evalJS(`document.getElementById('gp-tab-rooms').click();document.getElementById('gp-export').click()`);
  const exported=path.join(downloadPath,'geometry-review-3broomroad.json');for(let i=0;i<100&&!fs.existsSync(exported);i++)await new Promise(r=>setTimeout(r,50));
  const payload=JSON.parse(fs.readFileSync(exported));assert.equal(payload.propertyId,'3broomroad');assert.equal(payload.review.stage,'site-refined');assert.equal(payload.prep.events.length,1);assert.equal(payload.result,undefined);
  fs.writeFileSync(path.join(testTmp,root.startsWith('file:')?'geometry-prep-file.png':'geometry-prep-http.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  // Evidence import is idempotent and another property is rejected without state changes.
  await call('DOM.enable');let doc=await call('DOM.getDocument'),input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#gp-import-file'});await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[exported]});await new Promise(r=>setTimeout(r,100));
  assert.equal(await evalJS('__SOLAR_VIZ__.building.state.geometryPrep.events.length'),1);
  const wrong=path.join(testTmp,'wrong-geometry-review.json');fs.writeFileSync(wrong,JSON.stringify({...payload,propertyId:'other'}));doc=await call('DOM.getDocument');input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#gp-import-file'});await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[wrong]});await new Promise(r=>setTimeout(r,100));assert.match(await evalJS('document.getElementById("geometry-prep-dialog").textContent'),/Wrong property/);fs.unlinkSync(exported);
  await evalJS(`document.getElementById('gp-close').click()`);await new Promise(r=>setTimeout(r,400));const saved=await evalJS('JSON.stringify(__SOLAR_VIZ__.building.state.geometryPrep)');
  await call('Page.reload',{ignoreCache:true});await ready();assert.equal(await evalJS('JSON.stringify(__SOLAR_VIZ__.building.state.geometryPrep)'),saved);
  const model=await evalJS('JSON.parse(JSON.stringify(__SOLAR_VIZ__.building.state))'),modelPath=path.join(testTmp,'ashp-model.json');fs.writeFileSync(modelPath,JSON.stringify(model));
  await evalJS(`document.getElementById('bm-restore-reconstruction').click()`);assert.equal(await evalJS('!!__SOLAR_VIZ__.building.state.geometrySource'),false);assert.equal(await evalJS('__SOLAR_VIZ__.building.state.geometryPrep.events.length'),1,'Restore retains append-only survey evidence');
  doc=await call('DOM.getDocument');input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#bm-import-file'});await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[modelPath]});for(let i=0;i<100;i++){if(await evalJS('!!__SOLAR_VIZ__.building.state.geometrySource'))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await evalJS('JSON.stringify(__SOLAR_VIZ__.building.state.windows)'),JSON.stringify(model.windows));assert.equal(await evalJS('__SOLAR_VIZ__.building.state.geometryPrep.events.length'),1);
  await evalJS(`__SOLAR_VIZ__.building.updateRoomLayout(0,[]);document.getElementById('bm-geometry-prep').click()`);assert.match(await evalJS('document.getElementById("geometry-prep-dialog").textContent'),/Geometry changed/);assert.equal(await evalJS(reviewExpr+'.stage'),'remote');
  await evalJS(`document.getElementById('gp-rebase').click()`);assert.equal(await evalJS('__SOLAR_VIZ__.building.state.geometryPrep.events.length'),1);assert.equal(await evalJS(reviewExpr+'.activeRevision'),null);
  await evalJS(`document.getElementById('gp-close').click();window.bb=__SOLAR_VIZ__.building;document.getElementById('bm-add-lower').click()`);
  assert.equal(await evalJS('bb.levels.length'),3);
  assert.equal(await evalJS('bb.lowerSolid.watertight.closed'),true);
  assert.equal(await evalJS('bb.state.windows.find(w=>w.sourceId==="basement-window").levelIdx'),2);
  assert.equal(await evalJS('bb.state.unboundCandidateOpenings.length'),1);
  assert.equal(await evalJS('bb.state.geometryPrep.events.length'),1);
  // Depth edits change the volume, preserving the fitted window's absolute elevation.
  await evalJS(`window.basementY=SolarViz.buildingOpenings.windowRect(bb.state.windows.find(w=>w.sourceId==='basement-window'),bb.solid,bb.levels).ring[0][1];document.getElementById('bm-lower-depth').value=2.8;document.getElementById('bm-add-lower').click()`);
  assert.equal(await evalJS('Math.abs(SolarViz.buildingOpenings.windowRect(bb.state.windows.find(w=>w.sourceId==="basement-window"),bb.solid,bb.levels).ring[0][1]-basementY)<1e-8'),true);
  await evalJS(`window.lowerSnapshot=JSON.parse(JSON.stringify(bb.state));document.getElementById('bm-lower-depth').value=3;document.getElementById('bm-add-lower').click();bb.replaceWorkingState(lowerSnapshot)`);
  assert.equal(await evalJS('Math.abs(SolarViz.buildingOpenings.windowRect(bb.state.windows.find(w=>w.sourceId==="basement-window"),bb.solid,bb.levels).ring[0][1]-basementY)<1e-8'),true,'Restoring inputs does not apply the depth correction twice');
  for(const idx of [0,1,2]){
    await evalJS(`__SOLAR_VIZ__.buildingWorkspace.select('rooms');document.getElementById('bm-manual-rooms').open=true;bb.updateRoomLayout(${idx},[]);bb.selectFloor(${idx});document.getElementById('bm-fp-import').click()`);
    assert.equal(await evalJS('document.getElementById("bm-fp-apply").disabled'),false);
    assert.match(await evalJS('document.getElementById("bm-fp-score").textContent'),new RegExp([3,5,5][idx]+'/'+[3,5,5][idx]+' rooms assigned'));
    await new Promise(r=>setTimeout(r,1000));
    fs.writeFileSync(path.join(testTmp,'floorplan-preview-'+idx+'-'+(root.startsWith('file:')?'file':'http')+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await evalJS(`document.getElementById('bm-fp-apply').click()`);
    assert.equal(await evalJS(`bb.roomsByLevel[${idx}].length`),[3,5,5][idx]);
    assert.equal(await evalJS(`bb.roomsByLevel[${idx}].every(r=>!!r.sourceRoomId)`),true);
  }
  assert.deepEqual(await evalJS('__SOLAR_VIZ__.geometryPrep.derive().coverageIssues'),[]);
  assert.equal(await evalJS('__SOLAR_VIZ__.geometryPrep.derive().rooms.every(r=>!r.geometryIssues.length)'),true);
  await evalJS(`__SOLAR_VIZ__.buildingWorkspace.select('house');bb.selectFloor(null);document.getElementById('bm-terrain').checked=true;document.getElementById('bm-terrain').dispatchEvent(new Event('change'));document.getElementById('bm-ghost').checked=false;document.getElementById('bm-ghost').dispatchEvent(new Event('change'));const c=bb.origin;__SOLAR_VIZ__.camera.position.set(c.x+14,c.y+13,c.z+20);__SOLAR_VIZ__.controls.target.set(c.x,c.y+1,c.z);__SOLAR_VIZ__.controls.update();`);
  await new Promise(r=>setTimeout(r,700));
  fs.writeFileSync(path.join(testTmp,'basement-cutaway-'+(root.startsWith('file:')?'file':'http')+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`document.getElementById('bm-reveal-lower').click()`);
  await evalJS(`window.frontMask=SolarViz.terrainCutout.frontage({footprint:bb.lowerSolid.footprint,frontRing:bb.solid.faces.find(f=>f.id==='main-front').ids.map(id=>bb.solid.clusters[id]),bearing:BROOM_RECONSTRUCTION.stages.find(s=>s.id===bb.state.geometrySource.stageId).model.parameters.bearing,groundY:bb.solid.groundY,openingBaseY:Math.min(...SolarViz.buildingOpenings.windowRect(bb.state.windows.find(w=>w.sourceId==='basement-window'),bb.solid,bb.levels).ring.map(p=>p[1]))});window.residual=0;const p=__SOLAR_VIZ__.terrainMesh.geometry.attributes.position;for(let i=0;i<p.count;i+=3){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3,y=(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3;if(y>frontMask.aboveY+.001&&SolarViz.buildingGeometry.pointInPolygon(frontMask.poly,x,z))residual++;}new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));`);
  assert.equal(await evalJS('residual'),0,'Default context removes the elevated frontage fringe with basement cutaway OFF');
  fs.writeFileSync(path.join(testTmp,'terrain-context.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`window.planState=JSON.stringify(bb.state.floors);bb.save()`);const planState=await evalJS('planState');await new Promise(r=>setTimeout(r,400));
  await call('Page.reload',{ignoreCache:true});await ready();assert.equal(await evalJS('JSON.stringify(__SOLAR_VIZ__.building.state.floors)'),planState);assert.equal(await evalJS('__SOLAR_VIZ__.building.state.windows.some(w=>w.sourceId==="basement-window")'),true);
  // Existing reconstructed saves gain only their missing room layouts on load.
  await evalJS(`window.legacy=JSON.parse(JSON.stringify(__SOLAR_VIZ__.building.state));delete legacy.automaticRooms;legacy.floors[0]={dividers:[],roomNames:{r:'Keep my room'},roomTypes:{}};legacy.floors[1]={dividers:[],roomNames:{},roomTypes:{}};legacy.floors[2]={dividers:[],roomNames:{},roomTypes:{}};__SOLAR_VIZ__.building.replaceWorkingState(legacy);__SOLAR_VIZ__.building.save()`);await new Promise(r=>setTimeout(r,400));
  await call('Page.reload',{ignoreCache:true});await ready();
  assert.equal(await evalJS('__SOLAR_VIZ__.building.roomsByLevel[0][0].name'),'Keep my room');
  assert.deepEqual(await evalJS('Object.values(__SOLAR_VIZ__.building.roomsByLevel).map(r=>r.length)'),[1,5,5]);
  assert.equal(await evalJS('__SOLAR_VIZ__.building.state.geometryPrep.events.length'),1);
  assert.equal(await evalJS('document.getElementById("bm-auto-summary").textContent.includes("Geometry changed")'),false);
  await evalJS(`document.getElementById('bm-restore-reconstruction').click()`);
  await call('Page.navigate',{url:root+'/index.html?property=original&mode=ashp'});await ready();assert.equal(await evalJS('!!window.BROOM_RECONSTRUCTION'),false);await evalJS(`document.getElementById('bm-geometry-prep').click()`);assert.equal(await evalJS('!!document.getElementById("gp-tab-plan")'),false);assert.equal(await evalJS('__SOLAR_VIZ__.building.state.geometryPrep.events.length'),0);
  console.log(root+': editable exterior, remote quantities/boundaries, plan inventory, survey acceptance, import/export, stale gates, history and property isolation passed');
 }

 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
