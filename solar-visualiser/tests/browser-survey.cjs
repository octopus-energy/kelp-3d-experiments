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
 for(const root of [process.env.REVIEW_HTTP_URL,pathToFileURL(appRoot).href]){
  await call('Page.navigate',{url:root+'/survey.html'});
  for(let i=0;i<100;i++){if(await evalJS('!!window.__SURVEY__'))break;await new Promise(r=>setTimeout(r,100))}
  assert.equal(await evalJS('!!window.__SURVEY__'),true);
  const original=await evalJS('JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith("reconstruction-survey:"))))');
  await evalJS('localStorage.removeItem("reconstruction-survey:"+__SURVEY__.workflow.propertyId+":"+__SURVEY__.workflow.revision)');
  await call('Page.reload',{ignoreCache:true});
  for(let i=0;i<100;i++){if(await evalJS('!!window.__SURVEY__'))break;await new Promise(r=>setTimeout(r,100))}
  assert.equal(await evalJS('document.querySelectorAll("#plan-overlay polygon").length'),12);
  assert.equal(await evalJS('document.querySelector("#plan-overlay image").getAttribute("href").startsWith("data:image/")'),true);
  await evalJS(`document.querySelector('[data-room="g-kitchen"]').dispatchEvent(new Event('click'));document.querySelector('#room-detail button').click()`);
  assert.equal(await evalJS('document.getElementById("survey-task").value'),'room-g-kitchen');
  await call('DOM.enable');const initialDoc=await call('DOM.getDocument');const fileInput=await call('DOM.querySelector',{nodeId:initialDoc.root.nodeId,selector:'#attachments'});
  await evalJS(`document.getElementById('survey-task').value='survey-emitter-kitchen';document.getElementById('survey-task').dispatchEvent(new Event('change'));document.getElementById('observer').value='Browser test surveyor';document.getElementById('method').value='Test fixture only';for(const [k,v] of Object.entries({width:1000,height:600,depth:100,type:'Double panel',pipes:'15 mm'}))document.querySelector('[data-field="'+k+'"]').value=v;`);
  await call('DOM.setFileInputFiles',{nodeId:fileInput.nodeId,files:[path.join(appRoot,'3broomroad-data/photos/08968f54527a305a14c70973df11894c.jpeg')]});
  await evalJS(`document.getElementById('survey-form').requestSubmit()`);
  for(let i=0;i<100;i++){if(await evalJS('__SURVEY__.packet.events.length===1'))break;await new Promise(r=>setTimeout(r,50))}
  assert.equal(await evalJS('__SURVEY__.packet.events.length'),1);
  assert.equal(await evalJS('__SURVEY__.packet.events[0].attachments.length'),1);
  assert.equal(await evalJS('__SURVEY__.summary.designStatus'),'not-approved');
  assert.equal(await evalJS('__SURVEY__.summary.affectedResults.includes("emitter-sizing")'),true);
  await evalJS(`document.getElementById('survey-task').value='homeowner-preferences';document.getElementById('survey-task').dispatchEvent(new Event('change'));document.querySelector('[data-field="preferences"]').value='Prefer rear courtyard; technical checks pending';document.getElementById('survey-form').requestSubmit()`);
  assert.equal(await evalJS('__SURVEY__.packet.events.length'),2);
  assert.equal(await evalJS('__SURVEY__.packet.events[1].status'),'homeowner-preference');
  // Export the exact in-memory packet, then exercise the real file input import.
  await evalJS(`document.getElementById('export-survey').click()`);const downloaded=downloadPath+'/3broomroad-survey-evidence.json';for(let i=0;i<100&&!fs.existsSync(downloaded);i++)await new Promise(r=>setTimeout(r,50));
  const packet=await evalJS('__SURVEY__.packet');assert.deepEqual(JSON.parse(fs.readFileSync(downloaded,'utf8')),packet,'Actual download matches survey including attachment');fs.unlinkSync(downloaded);fs.writeFileSync(path.join(testTmp,'survey-test-import.json'),JSON.stringify(packet));
  await call('DOM.enable');const doc=await call('DOM.getDocument');let input=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#import-survey'});await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(testTmp,'survey-test-import.json')]});await new Promise(r=>setTimeout(r,200));
  assert.equal(await evalJS('__SURVEY__.packet.events.length'),2,'Import is idempotent');
  fs.writeFileSync(path.join(testTmp,'survey-test-wrong.json'),JSON.stringify({...packet,propertyId:'wrong-house'}));await call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(testTmp,'survey-test-wrong.json')]});await new Promise(r=>setTimeout(r,200));assert.match(await evalJS('document.getElementById("feedback").textContent'),/another property/);
  assert.equal(await evalJS('__SURVEY__.packet.events.length'),2,'Bad import preserved evidence');
  assert.equal(await evalJS('JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.startsWith("reconstruction-survey:"))))'),original);
  await call('Page.reload',{ignoreCache:true});for(let i=0;i<100;i++){if(await evalJS('!!window.__SURVEY__'))break;await new Promise(r=>setTimeout(r,100))}
  assert.equal(await evalJS('__SURVEY__.packet.events.length'),2,'Survives reload');
  await evalJS(`document.getElementById('survey-task').value='survey-emitter-kitchen';document.getElementById('survey-task').dispatchEvent(new Event('change'));document.getElementById('record-status').value='partial-observation';document.getElementById('record-status').dispatchEvent(new Event('change'));document.getElementById('observer').value='Browser test';document.getElementById('method').value='Tape';document.getElementById('notes').value='Only width accessible';document.querySelector('[data-field=width]').value=900;document.getElementById('survey-form').requestSubmit()`);assert.equal(await evalJS('__SURVEY__.packet.events.length'),3);
  await evalJS('localStorage.removeItem("reconstruction-survey:"+__SURVEY__.workflow.propertyId+":"+__SURVEY__.workflow.revision)');
  await call('Page.reload',{ignoreCache:true});await new Promise(r=>setTimeout(r,300));
  fs.writeFileSync(path.join(testTmp,'broom-survey-final.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  console.log(root+': rooms, embedded images, measurement and homeowner forms, import, persistence and property isolation passed');
 }
 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
