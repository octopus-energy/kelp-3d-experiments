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
  await call('Network.emulateNetworkConditions',{offline:root.startsWith('file:'),latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await call('Page.navigate',{url:root+'/proposal.html'});
  for(let i=0;i<150;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}
  const snapshot=async (name,selector)=>{if(selector)await evalJS(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`);await new Promise(r=>setTimeout(r,100));fs.writeFileSync(path.join(testTmp,'planning-'+name+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));};
  const fill=async (selector,values)=>evalJS(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});for(const [key,value] of Object.entries(${JSON.stringify(values)}))f.elements[key].value=value;f.requestSubmit();})()`);
  assert.deepEqual(await evalJS(`[...document.querySelectorAll('#journey-nav button')].map(b=>Number(b.dataset.step))`),[0,2,3,1,4,5]);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await evalJS(`__BROOM_INSTALLATION__.go(3);document.querySelector('[data-start-placement]').click();(()=>{const r=BROOM_PROPOSAL.geometry.geometry.rooms.find(r=>r.id==='0:r0'),c=SolarViz.spatial.centre(r),s=document.getElementById('equipment-plan'),p=new DOMPoint(c[0],-c[1]).matrixTransform(s.getScreenCTM());s.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:p.x,clientY:p.y}));})()`);
  await evalJS(`(()=>{const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const c=canvas.getContext('2d');c.fillStyle='#286e59';c.fillRect(0,0,32,32);const binary=atob(canvas.toDataURL('image/png').split(',')[1]),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0)),dt=new DataTransfer();dt.items.add(new File([bytes],'synthetic-service.png',{type:'image/png'}));document.querySelector('[data-spatial-service-form]').elements.files.files=dt.files;})()`);
  await fill('[data-spatial-service-form]',{note:'Existing boiler in kitchen cupboard; synthetic test'});
  for(let i=0;i<100;i++){if(await evalJS(`SolarViz.installationPlanning.latestService(__BROOM_INSTALLATION__.project,'boiler')?.attachments?.length===1`))break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(await evalJS(`SolarViz.installationPlanning.latestService(__BROOM_INSTALLATION__.project,'boiler').position.roomId`),'0:r0');
  assert.equal(await evalJS(`SolarViz.installationPlanning.latestService(__BROOM_INSTALLATION__.project,'boiler').attachments.length`),1);
  await snapshot('services-phone','[data-spatial-service-form]');
  await evalJS(`__BROOM_INSTALLATION__.go(1)`);
  await fill('[data-planning-form=gas]',{intent:'explore',appliances:'Gas hob remains',standingPence:'32',source:'Synthetic bill'});
  await fill('[data-planning-form=finance]',{method:'loan',extra:'2000',deposit:'1000',apr:'6',months:'60',source:'Synthetic comparison, not an offer'});
  assert.equal(await evalJS(`document.getElementById('payment-result').textContent.includes('/ month')`),true);
  assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true);
  await snapshot('payment-phone','#payment-planning');await snapshot('payment-result-phone','#payment-result');
  await evalJS(`document.querySelector('[data-role=adviser]').click();document.querySelector('[data-check-entry=siting]').click()`);
  await fill('[data-planning-form=planning-check][data-target=siting]',{status:'reviewed',reference:'Fixture assessment only',scope:'Courtyard candidate',observer:'Adviser fixture',note:'Synthetic review for automated test'});
  assert.equal(await evalJS(`SolarViz.installationPlanning.checks(__BROOM_INSTALLATION__.project).find(c=>c.id==='siting').status`),'reviewed');
  await snapshot('checks-phone','#design-checklist');
  await evalJS(`__BROOM_INSTALLATION__.go(3);document.querySelector('[data-spatial-target="proposed:cylinder"]').click();document.querySelector('[data-open-cylinder]').click();__BROOM_INSTALLATION__.go(4)`);
  assert.equal(await evalJS(`SolarViz.installationPlanning.checks(__BROOM_INSTALLATION__.project).find(c=>c.id==='siting').stale`),true);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});await snapshot('checks-desktop','#design-checklist');
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.summary().includes('Gas hob remains')&&__BROOM_INSTALLATION__.summary().includes('Fixture assessment only')`),true);
  await evalJS(`__BROOM_INSTALLATION__.go(5);document.getElementById('review-planning').open=true`);await snapshot('review-brief-desktop','#review-planning');
  const count=await evalJS('__BROOM_INSTALLATION__.project.events.length');await evalJS(`delete window.__BROOM_INSTALLATION__`);await call('Page.reload');for(let i=0;i<150;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.events.length'),count,'Planning survives reload');
  assert.equal(await evalJS(`SolarViz.installationPlanning.latestService(__BROOM_INSTALLATION__.project,'boiler').position.roomId`),'0:r0');
  assert.equal(await evalJS(`SolarViz.installation.replay(__BROOM_INSTALLATION__.project,BROOM_PROPOSAL,0).household.planning`),undefined);
  console.log(root+': room-led facts/ideas, services, gas, finance, check invalidation and reload passed');
 }
 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
