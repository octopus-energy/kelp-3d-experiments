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
  const snapshot=async(name,selector)=>{if(selector)await evalJS(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`);await new Promise(r=>setTimeout(r,100));fs.writeFileSync(path.join(testTmp,'minimal-room-'+(root.startsWith('file:')?'offline-':'http-')+name+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));};
  const fill=async(selector,values)=>evalJS(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});for(const [key,value] of Object.entries(${JSON.stringify(values)}))f.elements[key].value=value;f.requestSubmit();})()`);
  assert.equal(await evalJS('document.getElementById("project-storage").hidden'),true);
  await evalJS('document.getElementById("show-saved-work").click()');assert.equal(await evalJS('document.getElementById("project-storage").hidden'),false);await evalJS('document.getElementById("dismiss-saved-work").click()');
  await evalJS(`__BROOM_INSTALLATION__.go(2);document.querySelector('[data-room="0:r0"]').click()`);
  assert.equal(await evalJS('document.querySelector(".room-visual").firstElementChild.className'),'room-photo-context');
  assert.equal(await evalJS('document.querySelector("#room-spatial-plan").hidden'),true);assert.equal(await evalJS('__ROOM_ASSESSMENT_VIEW__.camera.isOrthographicCamera'),true);
  assert.equal(await evalJS('__ROOM_ASSESSMENT_VIEW__.meshes.some(m=>m.userData.wallThickness===.16)'),true);
  assert.equal(await evalJS(`['U-value','m²','Temperature difference','Heat transfer','W/m'].some(s=>document.querySelector('.home-heat').textContent.includes(s))`),false);
  assert.equal(await evalJS('document.querySelectorAll(".home-heat button[type=submit]").length'),0);
  const before=await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW');
  await evalJS(`(()=>{const s=document.querySelector('[data-home-assumption]');s.value='unheated';s.dispatchEvent(new Event('change'))})()`);
  assert(await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW')<before);assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.at(-1).role'),'homeowner');
  assert.equal(await evalJS('document.querySelector("[data-home-assumption]").value'),'unheated');assert.equal(await evalJS('document.getElementById("journey-message").textContent'),'');
  await evalJS(`document.querySelector('[data-element-category=windows]').click()`);const current=await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW');
  await evalJS(`(()=>{const s=document.querySelector('[data-home-assumption]');s.value='single';s.dispatchEvent(new Event('change'))})()`);assert(await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW')>current);
  await evalJS(`(()=>{const s=document.querySelector('[data-home-assumption]');s.value='double';s.dispatchEvent(new Event('change'))})()`);assert(await evalJS('__BROOM_INSTALLATION__.brief.selected.loadW')<await evalJS('SolarViz.installation.replay(__BROOM_INSTALLATION__.project,BROOM_PROPOSAL,__BROOM_INSTALLATION__.project.events.length-1).events.at(-1).after.loadW'));
  await snapshot('desktop','.room-guide-heading');
  await evalJS(`document.querySelector('[data-room-view="2d"]').click()`);assert.equal(await evalJS('document.getElementById("room-model-slot").hidden'),true);await snapshot('plan-desktop','.room-guide-heading');
  await evalJS(`document.querySelector('[data-room-view="3d"]').click()`);const camera=await evalJS('__ROOM_ASSESSMENT_VIEW__.camera.position.toArray()');
  const pt=await evalJS(`(()=>{const b=__ROOM_ASSESSMENT_VIEW__.renderer.domElement.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);await call('Input.dispatchMouseEvent',{type:'mousePressed',...pt,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x+60,y:pt.y+20,button:'left',buttons:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:pt.x+60,y:pt.y+20,button:'left',clickCount:1});assert.deepEqual(await evalJS('__ROOM_ASSESSMENT_VIEW__.camera.position.toArray()'),camera);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true);await snapshot('phone-photo','.room-guide-heading');await snapshot('phone-answer','.room-conversation');
  await evalJS(`document.querySelector('header [data-role=adviser]').click();__BROOM_INSTALLATION__.go(2)`);assert.equal(await evalJS('!!document.querySelector(".assumption-facts")'),true);assert.equal(await evalJS('document.querySelector("[data-assessment-form=surface]").elements.note.required'),true);
  await evalJS(`document.querySelector('header [data-role=customer]').click()`);const count=await evalJS('__BROOM_INSTALLATION__.project.events.length');await evalJS('delete window.__BROOM_INSTALLATION__');await call('Page.reload');for(let i=0;i<150;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}assert.equal(await evalJS('__BROOM_INSTALLATION__.project.events.length'),count);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});console.log(root+': photo-first layout, fixed isometric thickness, model toggle, percentage shares, immediate answers, technical provenance, phone and reload passed');
 }
 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
