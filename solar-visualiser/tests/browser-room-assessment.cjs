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
  const snapshot=async(name,selector)=>{if(selector)await evalJS(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`);await new Promise(r=>setTimeout(r,100));fs.writeFileSync(path.join(testTmp,'room-assessment-'+name+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));};
  const fill=async(selector,values)=>evalJS(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});for(const [key,value] of Object.entries(${JSON.stringify(values)}))f.elements[key].value=value;f.requestSubmit();})()`);
  await evalJS(`__BROOM_INSTALLATION__.go(2);document.querySelector('[data-room="0:r0"]').click()`);
  if(errors.length)console.log(JSON.stringify(errors,null,2));
  assert.deepEqual(await evalJS(`[...document.querySelectorAll('.room-stages button')].map(b=>Number(b.dataset.roomStage))`),[3,0,1,4,2]);
  assert.equal(await evalJS('document.querySelectorAll("#journey-content details").length'),0,'No room content hidden in accordions');
  assert.equal(await evalJS('document.querySelectorAll(".heat-share-list button").length'),7);
  await evalJS(`document.querySelector('header [data-role=adviser]').click();__BROOM_INSTALLATION__.go(2)`);
  assert.equal(await evalJS('!!window.__ROOM_ASSESSMENT_VIEW__&&__ROOM_ASSESSMENT_VIEW__.meshes.length>10'),true);
  assert.equal(await evalJS('document.querySelector("[data-assessment-form=boundary]").elements.note.required'),true,'Professional assessments retain their source requirement');
  await snapshot('heat-desktop','.room-guide-heading');
  await evalJS(`document.querySelector('[data-element-category=windows]').click()`);
  const before=await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW');
  await fill('[data-assessment-form=surface]',{u:'4.8',note:'Synthetic glazing source'});
  assert(await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW')>before,'Current window correction changes demand');
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.at(-1).kind'),'surface-assumption');
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.at(-1).note.includes("Synthetic glazing source")'),true,'Professional evidence retains its source');
  await snapshot('window-desktop','#selected-element');
  await evalJS(`document.querySelector('[data-reset-surface]').click()`);assert.equal(await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW'),before);
  // Click a real projected model face rather than hard-coded screen coordinates.
  const hit=await evalJS(`(()=>{const v=__ROOM_ASSESSMENT_VIEW__,m=v.meshes.find(m=>m.userData.ids.some(id=>id.includes('kitchen-side-window')));m.geometry.computeBoundingSphere();const p=m.localToWorld(m.geometry.boundingSphere.center.clone()).project(v.camera),b=v.renderer.domElement.getBoundingClientRect();v.renderer.domElement.scrollIntoView({block:'center'});const c=v.renderer.domElement.getBoundingClientRect();return {x:c.x+(p.x+1)/2*c.width,y:c.y+(1-p.y)/2*c.height};})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',x:hit.x,y:hit.y,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:hit.x,y:hit.y,button:'left',clickCount:1});
  assert.equal(await evalJS('document.getElementById("selected-element").textContent.includes("Kitchen side window")'),true,'3D face selects its actual assumption');
  await evalJS(`document.getElementById('room-topic-next').click()`);assert.equal(await evalJS(`document.querySelector('.room-stages [aria-current=step]').dataset.roomStage`),'0');
  await evalJS(`document.getElementById('room-topic-next').click()`);assert.equal(await evalJS(`document.querySelector('.room-stages [aria-current=step]').dataset.roomStage`),'1');
  const seeded=await evalJS('document.querySelectorAll("[data-radiator-select]").length');assert(seeded>=1);
  await snapshot('inventory-desktop','.room-guide-heading');
  await fill('[data-assessment-form=radiator]',{widthMm:'1000',heightMm:'600',type:'panel22',note:'Synthetic dimensions'});
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.choices.radiatorInventories['0:r0'].items[0].widthMm`),1000);
  await evalJS(`document.querySelector('[data-radiator-add]').click()`);
  await fill('[data-assessment-form=radiator]',{label:'Added test radiator',widthMm:'800',heightMm:'600',type:'panel22',note:'Synthetic new inventory item'});
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.choices.radiatorInventories['0:r0'].items.length`),seeded+1);
  await evalJS(`const f=document.querySelector('[data-assessment-form=inventory-complete]');f.elements.complete.checked=true;f.requestSubmit()`);
  const nBefore=await evalJS(`__BROOM_INSTALLATION__.project.choices.radiatorInventories['0:r0'].items.length`);
  await evalJS(`(()=>{const c=document.createElement('canvas');c.width=20;c.height=20;c.getContext('2d').fillRect(0,0,20,20);const bytes=Uint8Array.from(atob(c.toDataURL().split(',')[1]),x=>x.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],'front.png',{type:'image/png'}));dt.items.add(new File([bytes],'side.png',{type:'image/png'}));document.getElementById('radiator-evidence-files').files=dt.files;document.getElementById('radiator-photo-target').selectedIndex=1;document.getElementById('radiator-evidence-form').requestSubmit();})()`);
  for(let i=0;i<100;i++){if(await evalJS(`__BROOM_INSTALLATION__.project.observations.at(-1).kind==='radiator-evidence'`))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.observations.at(-1).attachments.length`),2);assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.choices.radiatorInventories['0:r0'].items.length`),nBefore,'Two photos never add two radiators');
  await evalJS(`document.querySelector('[data-room-stage="2"]').click()`);const demand=await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW');
  await evalJS(`document.querySelector('[data-option-category=walls]').click();const s=document.getElementById('option-u');s.value=.3;s.dispatchEvent(new Event('input'))`);
  assert.equal(await evalJS(`document.getElementById('improvement-results').textContent.includes('3,294 W')`),true,'Wall insulation changes the live room comparison');await snapshot('options-desktop','.improvement-lab');await evalJS(`document.querySelector('[data-save-improvement]').click()`);
  assert.equal(await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW'),demand,'Proposed insulation does not rewrite actual construction');assert(await evalJS(`Object.keys(__BROOM_INSTALLATION__.project.household.planning.rooms['0:r0'].surfaceIdeas).length`)>0);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  for(const [stage,name] of [[3,'heat-phone'],[0,'comfort-phone'],[1,'inventory-phone'],[4,'flow-phone'],[2,'options-phone']]){await evalJS(`document.querySelector('[data-room-stage="${stage}"]').click()`);assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,name+' fits phone');await snapshot(name,'.room-conversation');}
  await snapshot('options-result-phone','#improvement-results');await evalJS(`document.querySelector('[data-room-stage="1"]').click();document.querySelector('[data-show-radiator-photos]').click()`);await snapshot('photo-upload-phone','#homeowner-capture');
  for(const step of [0,1,3,4,5]){await evalJS(`__BROOM_INSTALLATION__.go(${step})`);assert.equal(await evalJS('document.querySelectorAll("#journey-content details").length'),0,'No accordions at step '+step);assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'Phone '+step);}
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});const count=await evalJS('__BROOM_INSTALLATION__.project.events.length');await evalJS('delete window.__BROOM_INSTALLATION__');await call('Page.reload');for(let i=0;i<150;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}assert.equal(await evalJS('__BROOM_INSTALLATION__.project.events.length'),count);assert.equal(await evalJS(`SolarViz.installation.replay(__BROOM_INSTALLATION__.project,BROOM_PROPOSAL,0).choices.radiatorInventories`),undefined);
  console.log(root+': 3D assumptions, signed breakdown, editable inventories, independent photo capture, insulation scenarios, phone and replay passed');
 }
 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
