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
 const root='http://127.0.0.1:8743/index.html';
 const waitReady=async()=>{for(let i=0;i<100;i++){if(await evalJS('!!window.__SOLAR_VIZ__'))return;await new Promise(r=>setTimeout(r,150))}throw Error('Load timeout')};
 const assert=require('node:assert/strict');
 for(const root of [process.env.REVIEW_HTTP_URL,pathToFileURL(appRoot).href]){
  await call('Page.navigate',{url:root+'/reconstruction.html'});
  for(let i=0;i<100;i++){if(await evalJS('!!window.__BROOM_RECONSTRUCTION__'))break;await new Promise(r=>setTimeout(r,100))}
  assert.equal(await evalJS('!!window.__BROOM_RECONSTRUCTION__'),true);
  assert.equal(await evalJS(`document.getElementById('photo').value`),'b3c87cfb9faa2d98b3231da431fae97b');
  assert.equal(await evalJS(`document.getElementById('stage').value`),'exterior-refined');
  const saved=await evalJS('JSON.stringify({...localStorage})');
  for(const stage of ['plan','photos','mono-across','mono-along','rear-corrected','exterior-refined']){
   await evalJS(`document.getElementById('stage').value='${stage}';document.getElementById('stage').dispatchEvent(new Event('change'))`);
   assert.equal(await evalJS(`document.getElementById('errors').textContent`),'');
   assert.equal(await evalJS(`document.querySelectorAll('#aerial-overlay polygon').length`),['rear-corrected','exterior-refined'].includes(stage)?8:9);
   assert.equal(await evalJS(`__BROOM_RECONSTRUCTION__.stage.model.openings.length`),14);
   assert.equal(await evalJS(`document.querySelectorAll('#aerial-overlay polyline').length`),2);
  }
  await evalJS(`document.getElementById('stage').value=__BROOM_RECONSTRUCTION__.data.recommendedStage;document.getElementById('stage').dispatchEvent(new Event('change'));document.getElementById('show-dsm').click();document.getElementById('rear').click();document.getElementById('show-openings').click();document.getElementById('show-openings').click();document.getElementById('show-dsm').click();document.getElementById('front').click()`);
  for(const id of ['4319b0211a370eba9015b36e035cc7a1','88a6310f77aee7b99e0c2e18136d4b78','bd31bdb708cc878cc82d2d19ad072c68','b3c87cfb9faa2d98b3231da431fae97b']){
   await evalJS(`document.getElementById('photo').value='${id}';document.getElementById('photo').dispatchEvent(new Event('change'))`);
   assert.equal(await evalJS(`document.querySelector('#overlay image').getAttribute('href').startsWith('data:image/')`),true);
  }
  assert.match(await evalJS(`document.getElementById('photo-info').textContent`),/REAR EXTENSION.*diagnostic-pass/);
  assert.equal(await evalJS('JSON.stringify({...localStorage})'),saved,'Review must not change saved state');
  await evalJS(`document.getElementById('photo').value='b3c87cfb9faa2d98b3231da431fae97b';document.getElementById('photo').dispatchEvent(new Event('change'));document.getElementById('rear').click()`);
  await new Promise(r=>setTimeout(r,200));
  fs.writeFileSync(path.join(testTmp,'broom-reconstruction-final.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`document.getElementById('photo').value='d234ecc31aca67d6789df113f1b380c8';document.getElementById('photo').dispatchEvent(new Event('change'))`);
  assert.match(await evalJS(`document.getElementById('photo-info').textContent`),/Excluded corner\/frame checks: 4\.9 px/);
  assert.equal(await evalJS(`__BROOM_RECONSTRUCTION__.data.rearReview.photos[1].points.filter(p=>p.use==='check').length`),2);
  fs.writeFileSync(path.join(testTmp,'broom-reconstruction-far-rear.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  console.log(root+': stages, geometry, openings, DSM toggle, references and storage checks passed');
 }
 await call('Page.navigate',{url:process.env.REVIEW_HTTP_URL+'/index.html?property=3broomroad'});
 for(let i=0;i<100;i++){if(await evalJS('!!window.__SOLAR_VIZ__'))break;await new Promise(r=>setTimeout(r,100))}
 assert.equal(await evalJS(`document.getElementById('bm-reconstruction').hidden`),false);
 await call('Page.navigate',{url:process.env.REVIEW_HTTP_URL+'/index.html?property=original'});
 for(let i=0;i<100;i++){if(await evalJS('!!window.__SOLAR_VIZ__'))break;await new Promise(r=>setTimeout(r,100))}
 assert.equal(await evalJS(`document.getElementById('bm-reconstruction').hidden`),true);
 assert.deepEqual(errors,[]);
 console.log('Main app link scoped to Broom Road; no console errors.');
 console.log('errors',JSON.stringify(errors));await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
