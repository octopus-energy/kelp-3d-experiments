const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{pathToFileURL}=require('node:url');
const appRoot=path.resolve(__dirname,'..'),testTmp=process.env.REVIEW_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'broom-review-'));
if(!process.env.REVIEW_CDP_URL)throw Error('Run via node tests/browser-review.cjs');
(async()=>{
 const ws=new WebSocket(process.env.REVIEW_CDP_URL); await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p.reject(d.error):p.resolve(d.result)} else if(d.method==='Runtime.exceptionThrown'||(d.method==='Runtime.consoleAPICalled'&&d.params.type==='error'))errors.push(d.params)};
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const key=++id;pending.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method,params,sessionId}))});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});const call=(m,p)=>send(m,p,sessionId);
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
 const evalJS=async expression=>{const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
 const assert=require('node:assert/strict');
 for(const root of [process.env.REVIEW_HTTP_URL,pathToFileURL(appRoot).href]){
  await call('Network.emulateNetworkConditions',{offline:root.startsWith('file:'),latency:0,downloadThroughput:-1,uploadThroughput:-1});await call('Page.navigate',{url:root+'/proposal.html'});
  for(let i=0;i<150;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('!!window.__BROOM_INSTALLATION__'),true,'Journey starts');
  const snapshot=async(name,selector)=>{if(selector)await evalJS(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`);await new Promise(r=>setTimeout(r,100));fs.writeFileSync(path.join(testTmp,'spatial-'+(root.startsWith('file:')?'offline-':'http-')+name+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));};
  const fill=async(selector,values)=>evalJS(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});for(const [key,value] of Object.entries(${JSON.stringify(values)}))f.elements[key].value=value;f.requestSubmit();})()`);
  const click=selector=>evalJS(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const planPoint=async(selector,x,z)=>{const p=await evalJS(`(()=>{const s=document.querySelector(${JSON.stringify(selector)});s.scrollIntoView({block:'center'});const p=new DOMPoint(${x},${-z}).matrixTransform(s.getScreenCTM());return {x:p.x,y:p.y};})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});};
  const centre=async id=>evalJS(`SolarViz.spatial.centre(BROOM_PROPOSAL.geometry.geometry.rooms.find(r=>r.id===${JSON.stringify(id)}))`);
  await evalJS('__BROOM_INSTALLATION__.go(3)');await snapshot('equipment-desktop','.spatial-equipment');
  assert.equal(await evalJS('document.querySelector("[data-spatial-service-form]").querySelectorAll("[required]").length'),0);
  await click('[data-start-placement]');const kitchen=await centre('0:r0');await planPoint('#equipment-plan',...kitchen);
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.at(-1).position.roomId'),'0:r0');
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.at(-1).position.heightM'),null);
  assert.deepEqual(await evalJS(`__BROOM_INSTALLATION__.view.services.children.find(m=>m.userData.markerId==='service:boiler').position.toArray()`),await evalJS(`SolarViz.spatial.point(BROOM_PROPOSAL,__BROOM_INSTALLATION__.project.observations.at(-1).position)`));
  const boilerCount=await evalJS('__BROOM_INSTALLATION__.project.observations.length');
  await click('[data-start-placement]');await click('[data-plan-panel="equipment-plan"] [data-floor-choice="2"]');const lowerId=await evalJS(`BROOM_PROPOSAL.geometry.geometry.rooms.find(r=>r.sourceRoomId==='lg-utility').id`),lower=await centre(lowerId);await planPoint('#equipment-plan',...lower);
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.at(-1).position.roomId'),lowerId);
  assert.equal(await evalJS(`SolarViz.spatial.markers(BROOM_PROPOSAL,SolarViz.installation.replay(__BROOM_INSTALLATION__.project,BROOM_PROPOSAL,${boilerCount})).find(m=>m.id==='service:boiler').position.roomId`),'0:r0');
  await click('[data-spatial-target="proposed:cylinder"]');await click('[data-start-placement]');await click('[data-plan-panel="equipment-plan"] [data-floor-choice="0"]');
  const before=await evalJS('__BROOM_INSTALLATION__.brief.selected.routing.length');await planPoint('#equipment-plan',...kitchen);
  assert.notEqual(await evalJS('__BROOM_INSTALLATION__.brief.selected.routing.length'),before);
  assert.deepEqual(await evalJS('__BROOM_INSTALLATION__.view.services.children.find(m=>m.userData.markerId==="proposed:cylinder").position.toArray()'),await evalJS('__BROOM_INSTALLATION__.brief.selected.routing.points.at(-1)'));
  await click('#no-kitchen');assert.equal(await evalJS('__BROOM_INSTALLATION__.brief.selected.blocked'),true);await click('#no-kitchen');
  await click('[data-spatial-target="path:clear"]');await click('[data-start-placement]');await planPoint('#equipment-plan',...kitchen);await planPoint('#equipment-plan',kitchen[0]+.5,kitchen[1]+.5);await click('[data-finish-path]');
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.household.planning.paths.length'),1);assert.equal(await evalJS('__BROOM_INSTALLATION__.view.services.children.some(m=>m.name==="keep-clear-path")'),true);
  await snapshot('placed-desktop','.equipment-map-grid');
  await evalJS('__BROOM_INSTALLATION__.go(2)');await click('[data-room="0:r0"]');await click('[data-room-stage="1"]');await click('[data-place-radiator]');await planPoint('#room-detail-plan',...kitchen);
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.at(-1).target'),'radiator');
  assert.equal(await evalJS('__ROOM_ASSESSMENT_VIEW__.meshes.some(m=>m.userData.markerId?.startsWith("radiator:"))'),true);
  await snapshot('room-desktop','.room-guide-heading');await click('[data-room-stage="3"]');
  const opening=await evalJS(`[...document.querySelectorAll('#room-detail-plan [data-plan-element]')].find(e=>e.dataset.planElement.includes('kitchen-side-window')).dataset.planElement`);
  await evalJS(`document.querySelector('#room-detail-plan [data-plan-element="'+${JSON.stringify(opening)}+'"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  assert.equal(await evalJS('document.getElementById("selected-element").textContent.includes("Kitchen side window")'),true);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  for(const n of [0,2,3,1,4,5]){await evalJS(`__BROOM_INSTALLATION__.go(${n})`);assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'Phone step '+n);await snapshot('phone-step-'+n,'#journey-content');}
  for(const r of ['adviser','surveyor']){await click('header [data-role="'+r+'"]');await evalJS('__BROOM_INSTALLATION__.go(4)');assert.equal(await evalJS('!!document.querySelector("#review-spatial-plan")'),true);await snapshot(r+'-phone','#review-spatial-plan');}
  await evalJS('__BROOM_INSTALLATION__.go(5)');assert.equal(await evalJS('__BROOM_INSTALLATION__.summary().includes("Equipment positions on the model plan")'),true);
  const count=await evalJS('__BROOM_INSTALLATION__.project.events.length');await evalJS('delete window.__BROOM_INSTALLATION__');await call('Page.reload');for(let i=0;i<150;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}assert.equal(await evalJS('__BROOM_INSTALLATION__.project.events.length'),count);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
  console.log(root+': shared 2D/3D coordinates, floor changes, service provenance, radiator placement, route consequences, path preferences, replay, phone and survey maps passed');
 }
 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
