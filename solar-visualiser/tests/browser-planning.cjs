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
  await call('Page.navigate',{url:root+'/proposal.html'});
  for(let i=0;i<150;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}
  const snapshot=async (name,selector)=>{if(selector)await evalJS(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'start'})`);await new Promise(r=>setTimeout(r,100));fs.writeFileSync(path.join(testTmp,'planning-'+name+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));};
  const fill=async (selector,values)=>evalJS(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});for(const [key,value] of Object.entries(${JSON.stringify(values)}))f.elements[key].value=value;f.requestSubmit();})()`);
  assert.deepEqual(await evalJS(`[...document.querySelectorAll('#journey-nav button')].map(b=>Number(b.dataset.step))`),[0,2,3,1,4,5]);
  await evalJS(`document.getElementById('journey-next').click();document.querySelector('[data-room="0:r11"]').click()`);
  assert.equal(await evalJS(`document.querySelector('.room-stages [aria-current=step]').dataset.roomStage`),'3');
  await snapshot('room-heat-desktop','.room-guide-heading');
  const demandBefore=await evalJS(`__BROOM_INSTALLATION__.brief.selected.loadW`);
  await evalJS(`document.getElementById('room-envelope-bay-lower').open=true`);
  await fill('[data-planning-form=envelope][data-target=bay-lower]',{value:'single',observer:'Homeowner fixture',note:'Synthetic glass-edge account'});
  assert(await evalJS(`__BROOM_INSTALLATION__.brief.selected.loadW`)>demandBefore);
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.choices.envelope['bay-lower'].basis`),'homeowner-reported');
  const observedDemand=await evalJS(`__BROOM_INSTALLATION__.brief.selected.loadW`);
  await evalJS(`document.querySelector('[data-room-stage="4"]').click()`);
  assert.equal(await evalJS(`document.querySelectorAll('.flow-row').length`),3);
  await snapshot('room-flow-desktop','.room-guide-heading');
  await evalJS(`document.querySelector('[data-room-stage="2"]').click();document.querySelector('[data-improvement=glazing]').click();document.getElementById('glazing-preview-0:r11').open=true;const s=document.querySelector('[data-glazing-preview=bay-lower]');s.value='double';s.dispatchEvent(new Event('change'))`);
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.brief.selected.loadW`),observedDemand,'Proposed upgrade never overwrites actual glazing');
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.household.planning.rooms['0:r11'].glazing['bay-lower']`),'double');
  await snapshot('glazing-desktop','.fabric-options');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  for(const [stage,name] of [[3,'room-heat-phone'],[4,'room-flow-phone'],[2,'room-options-phone']]){await evalJS(`document.querySelector('[data-room-stage="${stage}"]').click()`);assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,name);await snapshot(name,'.room-conversation');}
  await evalJS(`__BROOM_INSTALLATION__.go(3);document.getElementById('service-boiler').open=true`);
  await fill('[data-planning-form=service][data-target=boiler]',{presence:'present',location:'Kitchen cupboard',observer:'Homeowner fixture',note:'Existing boiler; synthetic test'});
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await evalJS(`SolarViz.installationPlanning.latestService(__BROOM_INSTALLATION__.project,'boiler').location`),'Kitchen cupboard');
  await snapshot('services-phone','#existing-services');
  await evalJS(`__BROOM_INSTALLATION__.go(1)`);
  await fill('[data-planning-form=gas]',{intent:'explore',appliances:'Gas hob remains',standingPence:'32',source:'Synthetic bill'});
  await fill('[data-planning-form=finance]',{method:'loan',extra:'2000',deposit:'1000',apr:'6',months:'60',source:'Synthetic comparison, not an offer'});
  assert.equal(await evalJS(`document.getElementById('payment-result').textContent.includes('/ month')`),true);
  assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true);
  await snapshot('payment-phone','#payment-planning');await snapshot('payment-result-phone','#payment-result');
  await evalJS(`document.querySelector('[data-role=adviser]').click();document.getElementById('check-siting').open=true`);
  await fill('[data-planning-form=planning-check][data-target=siting]',{status:'reviewed',reference:'Fixture assessment only',scope:'Courtyard candidate',observer:'Adviser fixture',note:'Synthetic review for automated test'});
  assert.equal(await evalJS(`SolarViz.installationPlanning.checks(__BROOM_INSTALLATION__.project).find(c=>c.id==='siting').status`),'reviewed');
  await snapshot('checks-phone','#design-checklist');
  await evalJS(`__BROOM_INSTALLATION__.go(3);document.querySelector('[data-location=outdoor][data-value=garden]').click();__BROOM_INSTALLATION__.go(4)`);
  assert.equal(await evalJS(`SolarViz.installationPlanning.checks(__BROOM_INSTALLATION__.project).find(c=>c.id==='siting').stale`),true);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});await snapshot('checks-desktop','#design-checklist');
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.summary().includes('Gas hob remains')&&__BROOM_INSTALLATION__.summary().includes('Fixture assessment only')`),true);
  const count=await evalJS('__BROOM_INSTALLATION__.project.events.length');await evalJS(`delete window.__BROOM_INSTALLATION__`);await call('Page.reload');for(let i=0;i<150;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.events.length'),count,'Planning survives reload');
  assert.equal(await evalJS(`SolarViz.installationPlanning.latestService(__BROOM_INSTALLATION__.project,'boiler').location`),'Kitchen cupboard');
  assert.equal(await evalJS(`SolarViz.installation.replay(__BROOM_INSTALLATION__.project,BROOM_PROPOSAL,0).household.planning`),undefined);
  console.log(root+': room-led facts/ideas, services, gas, finance, check invalidation and reload passed');
 }
 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
