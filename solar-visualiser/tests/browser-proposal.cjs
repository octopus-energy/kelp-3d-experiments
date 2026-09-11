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
  await call('Page.navigate',{url:root+'/proposal.html?view=technical'});
  for(let i=0;i<120;i++){if(await evalJS('!!window.__BROOM_PROPOSAL__'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('!!window.__BROOM_PROPOSAL__'),true,'Proposal initialises');
  const initial=await evalJS('({text:document.body.innerText,result:__BROOM_PROPOSAL__.result})');assert(!initial.text.includes('undefined'));assert.equal(initial.result.unknown,7);assert.equal(initial.result.estimated,6);assert(initial.result.budget.netTotal>2600&&initial.result.budget.netTotal<2800);assert.equal(initial.result.budget.grantDeduction,7500);
  assert.equal(await evalJS(`(()=>{const v=__BROOM_PROPOSAL__.view;v.render();const gl=v.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);let dark=0;for(let i=0;i<p.length;i+=16)if(p[i]<180&&p[i+1]<180)dark++;return dark>1000;})()`),true,'Visible model pixels');
  for(let i=0;i<5;i++){
   await evalJS('__BROOM_PROPOSAL__.select('+i+')');await new Promise(r=>setTimeout(r,150));
   assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'No overflow');
   assert.equal(await evalJS('document.querySelectorAll("#chapters [aria-current=step]").length'),1);
   fs.writeFileSync(path.join(testTmp,'proposal-'+i+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await evalJS(`__BROOM_PROPOSAL__.select(3);window.beforeRadPrice=__BROOM_PROPOSAL__.result.budget.netTotal;var radRate=document.querySelector('[data-rate="radiatorChange"]');radRate.value=450;radRate.dispatchEvent(new Event('change'))`);
  assert.equal(await evalJS('__BROOM_PROPOSAL__.result.installationPackage.emitterCost'),3600,'Editable flat allowance used for all eight scheduled radiators');
  await evalJS(`var radRate=document.querySelector('[data-rate="radiatorChange"]');radRate.value=300;radRate.dispatchEvent(new Event('change'))`);
  assert.equal(await evalJS('__BROOM_PROPOSAL__.result.budget.netTotal'),await evalJS('beforeRadPrice'));
  await evalJS(`__BROOM_PROPOSAL__.select(1);window.initialAnnual=__BROOM_PROPOSAL__.result.running.selected.annualCost;var opInput=document.querySelector('[data-operating="electricityPence"]');opInput.value=54;opInput.dispatchEvent(new Event('change'))`);
  assert.equal(await evalJS('__BROOM_PROPOSAL__.result.running.selected.annualCost'),2*await evalJS('initialAnnual'));
  await evalJS(`var opInput=document.querySelector('[data-operating="electricityPence"]');opInput.value=27;opInput.dispatchEvent(new Event('change'));document.querySelector('.running-costs').scrollIntoView({block:'start'})`);
  fs.writeFileSync(path.join(testTmp,'proposal-running-costs.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`__BROOM_PROPOSAL__.select(3);document.getElementById('grant-included').click()`);
  assert.equal(await evalJS('__BROOM_PROPOSAL__.result.budget.netTotal'),await evalJS('__BROOM_PROPOSAL__.result.budget.total'));
  await evalJS(`document.getElementById('grant-included').click()`);assert.equal(await evalJS('__BROOM_PROPOSAL__.result.budget.grantDeduction'),7500);
  await evalJS(`__BROOM_PROPOSAL__.select(0);window.originalLoad=__BROOM_PROPOSAL__.result.scenario.totalW;var thermalInput=document.querySelector('[data-envelope="rear-neighbour-ground"]');thermalInput.value='heated';thermalInput.dispatchEvent(new Event('change'))`);
  assert(await evalJS('__BROOM_PROPOSAL__.result.scenario.totalW<originalLoad'));
  await evalJS(`var thermalInput=document.querySelector('[data-envelope="rear-neighbour-ground"]');thermalInput.value='unknown';thermalInput.dispatchEvent(new Event('change'))`);
  await evalJS(`__BROOM_PROPOSAL__.select(1);var thermalInput=document.querySelector('[data-envelope="kitchen-side-window"]');for(let p=thermalInput;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;thermalInput.value='double';thermalInput.dispatchEvent(new Event('change'))`);
  assert.equal(await evalJS(`document.querySelector('[data-envelope="kitchen-side-window"]').closest('details').open`),true,'Keep confirmation context open after recalculation');
  await evalJS(`document.querySelector('[data-envelope-note="kitchen-side-window"]').value='Homeowner confirms two panes at kitchen window';document.querySelector('[data-confirm-envelope="kitchen-side-window"]').click()`);
  assert.equal(await evalJS('__BROOM_PROPOSAL__.state.envelope["kitchen-side-window"].basis'),'homeowner-reported');
  assert.equal(await evalJS(`document.querySelectorAll('#room-plan polyline[stroke="#407cad"]').length>0`),true,'Party walls visible on room plan');
  await evalJS(`document.querySelector('[data-envelope="kitchen-side-window"]').scrollIntoView({block:'center'})`);
  fs.writeFileSync(path.join(testTmp,'proposal-glazing.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`__BROOM_PROPOSAL__.select(1);document.querySelector('[data-value="45"]').click()`);
  assert.equal(await evalJS('document.getElementById("use-photo-estimates").checked'),true);
  await evalJS('document.getElementById("use-photo-estimates").click()');assert.equal(await evalJS('__BROOM_PROPOSAL__.result.unknown'),13);
  await evalJS('document.getElementById("use-photo-estimates").click()');assert.equal(await evalJS('__BROOM_PROPOSAL__.result.estimated'),6);
  assert.equal(await evalJS('document.querySelectorAll(".radiator-evidence").length'),3,'Two room emitters plus unassigned bedroom');
  const required=await evalJS('__BROOM_PROPOSAL__.result.rooms[0].required50');
  await evalJS(`document.querySelector('[data-value="55"]').click()`);assert(required>await evalJS('__BROOM_PROPOSAL__.result.rooms[0].required50'));
  await evalJS(`document.getElementById('emitter-output').value='1000';document.getElementById('emitter-source').value='Homeowner reads manufacturer label';document.getElementById('save-emitter').click()`);assert.equal(await evalJS('__BROOM_PROPOSAL__.result.upgrade'),1);
  assert.equal(await evalJS(`Promise.all([...document.querySelectorAll('.evidence-photo image')].map(el=>new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im.naturalWidth>0);im.onerror=()=>resolve(false);im.src=el.getAttribute('href');}))).then(xs=>xs.length>0&&xs.every(Boolean))`),true,'Emitter evidence loads offline');
  await evalJS(`document.querySelectorAll('details').forEach(d=>{if(d.querySelector('.radiator-evidence'))d.open=true});document.querySelector('.radiator-evidence').scrollIntoView()`);
  fs.writeFileSync(path.join(testTmp,'proposal-radiator-evidence.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'Expanded radiator tables fit phone');
  await evalJS(`document.querySelector('.radiator-evidence').scrollIntoView({block:'start'})`);
  fs.writeFileSync(path.join(testTmp,'proposal-radiator-phone.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
  await evalJS(`document.querySelector('[data-floor="2"]').click()`);assert.equal(await evalJS('document.querySelectorAll("#room-plan polygon").length'),5);
  await evalJS(`__BROOM_PROPOSAL__.select(2);document.querySelector('[data-choice="outdoor"][data-value="garden"]').click()`);const far=await evalJS('__BROOM_PROPOSAL__.result.routing.length');await evalJS(`document.querySelector('[data-value="courtyard"]').click()`);assert(far>await evalJS('__BROOM_PROPOSAL__.result.routing.length'));
  await evalJS(`document.querySelector('[data-value="unresolved"]').click()`);assert.equal(await evalJS('__BROOM_PROPOSAL__.result.budget.total'),null);await evalJS(`document.querySelector('[data-value="utility"]').click()`);
  await evalJS(`__BROOM_PROPOSAL__.select(3);document.querySelector('[data-rate="equipment"]').value='10000';document.querySelector('[data-rate="equipment"]').dispatchEvent(new Event('change'))`);assert.equal(await evalJS('__BROOM_PROPOSAL__.state.rates.equipment'),10000);
  await evalJS(`__BROOM_PROPOSAL__.select(4);document.getElementById('notes').value='<img src=x onerror=alert(1)> Keep the garden clear';document.getElementById('notes').dispatchEvent(new Event('change'))`);assert.equal(await evalJS('document.querySelectorAll("#print-summary img").length'),0,'Escaped homeowner content');
  const state=await evalJS('JSON.stringify(__BROOM_PROPOSAL__.state)');await call('Page.reload');for(let i=0;i<120;i++){if(await evalJS('!!window.__BROOM_PROPOSAL__'))break;await new Promise(r=>setTimeout(r,100));}assert.equal(await evalJS('JSON.stringify(__BROOM_PROPOSAL__.state)'),state,'Choices persist');
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:testTmp});
  const htmlFile=path.join(testTmp,'3-broom-road-your-heat-pump.html');if(fs.existsSync(htmlFile))fs.unlinkSync(htmlFile);
  await evalJS('document.getElementById("save-summary").click()');
  for(let i=0;i<50&&!fs.existsSync(htmlFile);i++)await new Promise(r=>setTimeout(r,100));
  assert(fs.existsSync(htmlFile),'Readable call summary downloaded');const summary=fs.readFileSync(htmlFile,'utf8');assert(summary.includes('Survey priorities'));assert(summary.includes('Running-cost comparison'));assert(summary.includes('BUS deduction'));assert(summary.includes('Seasonal')||summary.includes('seasonal'));assert(summary.includes('&lt;img'));assert(!summary.includes('<img src=x'));
  assert(summary.includes('Photo estimate; catalogue analogues'));assert(summary.includes('visible emitters only'));
  const snap=await evalJS('__BROOM_PROPOSAL__.snapshot()');assert.equal(snap.designApproved,false);assert(snap.choices.events.length>=5);fs.writeFileSync(path.join(testTmp,'proposal-export.json'),JSON.stringify(snap,null,2));
  await call('DOM.enable');const {root:doc}=await call('DOM.getDocument');const {nodeId}=await call('DOM.querySelector',{nodeId:doc.nodeId,selector:'#import'});
  await call('DOM.setFileInputFiles',{nodeId,files:[path.join(testTmp,'proposal-export.json')]});
  for(let i=0;i<50;i++){if(await evalJS('document.getElementById("storage-message").textContent.includes("Call restored")'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_PROPOSAL__.state.events.at(-1).action'),'restore-discussion');

  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  for(let i=0;i<5;i++){await evalJS('__BROOM_PROPOSAL__.select('+i+')');await new Promise(r=>setTimeout(r,100));assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'Phone layout fits: '+i);}
  fs.writeFileSync(path.join(testTmp,'proposal-phone.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
  console.log(root+': proposal rendering, room evidence, decisions, price coupling, offline persistence, export and phone layout passed');
 }
 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
