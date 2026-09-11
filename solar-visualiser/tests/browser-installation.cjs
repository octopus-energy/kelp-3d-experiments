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
  assert.equal(await evalJS('!!window.__BROOM_INSTALLATION__'),true,'Guided journey starts');
  assert.equal(await evalJS('__BROOM_INSTALLATION__.brief.selected.emitterCost'),2400);
  assert.equal(await evalJS(`[...document.querySelectorAll('#journey-content input:not([type=checkbox]),#journey-content textarea')].filter(e=>!e.closest('details:not([open])')&&e.getBoundingClientRect().height>0).length`),0,'Household starts with visual choices and no visible text fields');
  assert.equal(await evalJS('__BROOM_INSTALLATION__.brief.selected.rooms.filter(r=>r.action==="inventory").every(r=>r.heatingPresence==="assumed-present"&&r.allowance===0&&r.proposedW===null)'),true);

  assert.equal(await evalJS(`document.getElementById('heated-lower-ground').textContent.includes('normally heated living space')`),true);
  assert.equal(await evalJS(`document.body.textContent.includes('How will you heat the lower ground?')`),false);
  await evalJS(`document.getElementById('model-detail').open=true`);
  await new Promise(r=>setTimeout(r,150));
  assert.equal(await evalJS(`document.getElementById('matching-start').compareDocumentPosition(document.getElementById('comfort-choices'))&Node.DOCUMENT_POSITION_FOLLOWING`),4,'Match before comfort');
  await evalJS(`document.getElementById('start-matching').click()`);
  assert.equal(await evalJS(`document.querySelectorAll('#photo-matching [data-photo-index]').length<SolarViz.installation.photoMatches(BROOM_PROPOSAL,__BROOM_INSTALLATION__.project).length`),true,'Confident matches omitted from help queue');
  await evalJS(`document.getElementById('close-matching').click()`);
  for(let step=0;step<6;step++){
   await evalJS('__BROOM_INSTALLATION__.go('+step+')');await new Promise(r=>setTimeout(r,100));
   assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'Desktop fits '+step);
   assert.equal(await evalJS('document.querySelectorAll("#journey-nav [aria-current=step]").length'),1);
   assert.equal(await evalJS('document.getElementById("journey-content").textContent.includes("undefined")'),false);
   assert.equal(await evalJS(`(()=>{const v=__BROOM_INSTALLATION__.view,l=v.services.getObjectByName('hydraulic-route'),r=__BROOM_INSTALLATION__.brief.selected.routing;return !!l&&l.geometry.attributes.position.count===r.points.length;})()`),true,'Actual route exists at step '+step);
   if(step!==2)assert.equal(await evalJS(`(()=>{const v=__BROOM_INSTALLATION__.view;v.render();const gl=v.renderer.getContext(),p=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,p);let orange=0;for(let i=0;i<p.length;i+=4)if(p[i]>150&&p[i]>p[i+1]*1.4&&p[i+1]>p[i+2]*1.3)orange++;return orange>100;})()`),true,'Orange route visibly renders at step '+step);
   if(step===1)assert.equal(await evalJS(`document.getElementById('option-comparison').textContent.includes('Both options schedule 8 radiator changes/additions at £300 each')`),true);
   fs.writeFileSync(path.join(testTmp,'installation-'+step+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await evalJS(`__BROOM_INSTALLATION__.go(2)`);
  assert.equal(await evalJS(`document.querySelectorAll('.room-workspace .room-plan polygon').length>1&&document.querySelectorAll('.room-conversation [data-cold]').length===1`),true,'One room question alongside floor context');
  const displayedPhoto=await evalJS(`document.querySelector('.room-photo-context>.journey-photo img').src`);
  await evalJS(`document.getElementById('room-correct-photo').click()`);
  assert.equal(await evalJS(`document.querySelector('#matching-evidence img').src`),displayedPhoto,'Correct match opens the photo being discussed');
  await evalJS(`document.getElementById('close-matching').click()`);
  const eventsBeforeWalk=await evalJS('__BROOM_INSTALLATION__.project.events.length');
  await evalJS(`document.getElementById('room-guide-next').click()`);
  assert.equal(await evalJS(`document.querySelector('.room-stages [aria-current="step"]').textContent`),'2. What we need');
  await evalJS(`document.getElementById('room-guide-next').click()`);
  assert.equal(await evalJS(`document.querySelector('.room-stages [aria-current="step"]').textContent`),'3. Your approach');
  fs.writeFileSync(path.join(testTmp,'installation-room-approach.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`document.getElementById('room-guide-next').click()`);
  assert.equal(await evalJS(`document.getElementById('room-jump').value`),'0:r10','Next room advances and starts its own discussion');
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.events.length'),eventsBeforeWalk,'Walking past a room never asserts evidence or approval');
  await evalJS(`__BROOM_INSTALLATION__.go(0)`);
  await evalJS(`document.getElementById('model-detail').scrollIntoView();__BROOM_INSTALLATION__.view.view('rear')`);
  fs.writeFileSync(path.join(testTmp,'installation-visible-route.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`__BROOM_INSTALLATION__.go(3);document.querySelector('[data-location="cylinder"][data-value="unresolved"]').click()`);
  assert.equal(await evalJS(`!__BROOM_INSTALLATION__.view.services.getObjectByName('hydraulic-route')&&document.getElementById('route-caption').textContent.includes('Choose a cylinder location')&&__BROOM_INSTALLATION__.brief.selected.net===null`),true,'Unresolved endpoint gives no invented route or price');
  await evalJS(`document.querySelector('[data-location="cylinder"][data-value="utility"]').click()`);
  assert.equal(await evalJS(`!!__BROOM_INSTALLATION__.view.services.getObjectByName('hydraulic-route')`),true);
  await evalJS(`__BROOM_INSTALLATION__.go(0);document.querySelector('[data-priority="running"]').click();__BROOM_INSTALLATION__.go(3);document.getElementById('no-kitchen').click();__BROOM_INSTALLATION__.go(2);document.querySelector('[data-room="0:r11"]').click();document.querySelector('[data-room-stage="2"]').click();document.querySelector('[data-keep="yes"]').click()`);
  assert.equal(await evalJS('__BROOM_INSTALLATION__.brief.suggested.flow'),45);
  await evalJS('__BROOM_INSTALLATION__.go(3)');assert.equal(await evalJS(`document.querySelector('[data-location="cylinder"][data-value="kitchen"]').disabled`),true);
  await evalJS(`document.querySelector('header [data-role="adviser"]').click();__BROOM_INSTALLATION__.go(4);document.querySelector('[data-task="emitter-0:r11"]').click()`);
  await evalJS(`document.getElementById('observation-role').value='surveyor';document.getElementById('observation-observer').value='Browser test fixture';document.getElementById('observation-note').value='Synthetic complete inventory for regression, not actual survey';document.getElementById('observation-output').value=9000;document.getElementById('inventory-complete').checked=true;document.getElementById('observation-form').requestSubmit()`);
  for(let i=0;i<50;i++){if(await evalJS('__BROOM_INSTALLATION__.step===5'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.length'),1);
  assert.equal(await evalJS('__BROOM_INSTALLATION__.brief.selected.rooms.find(r=>r.id==="0:r11").action'),'retain');
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.events.at(-1).before.loadW===__BROOM_INSTALLATION__.project.events.at(-1).after.loadW'),true);
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.events.at(-1).after.net<__BROOM_INSTALLATION__.project.events.at(-1).before.net'),true);
  await evalJS(`document.getElementById('replay-back').click()`);assert.equal(await evalJS('__BROOM_INSTALLATION__.cursor===__BROOM_INSTALLATION__.project.events.length-1'),true);
  await evalJS(`document.getElementById('replay-forward').click()`);
  fs.writeFileSync(path.join(testTmp,'installation-measurement-replay.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Page.reload');for(let i=0;i<100;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.length'),1);
  assert.equal(await evalJS('__BROOM_INSTALLATION__.summary().includes("Browser test fixture")'),true);
  await call('Page.navigate',{url:root+'/proposal.html?view=technical'});for(let i=0;i<120;i++){if(await evalJS('!!window.__BROOM_PROPOSAL__'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_PROPOSAL__.state.emitters["0:r11"].output50'),9000,'Technical workspace shares live state');
  await evalJS(`__BROOM_PROPOSAL__.select(1);document.querySelector('[data-choice="flow"][data-value="55"]').click()`);
  await call('Page.navigate',{url:root+'/proposal.html'});for(let i=0;i<120;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.choices.flow'),55,'Technical edits come back into guided view');
  await evalJS(`document.querySelector('header [data-role="adviser"]').click();__BROOM_INSTALLATION__.go(4);document.querySelector('[data-task="geometry"]').click();document.getElementById('observation-observer').value='Browser geometry fixture';document.getElementById('observation-height').value=2.7;document.getElementById('observation-area').value=22;document.getElementById('observation-note').value='Synthetic geometry discrepancy for regression';document.getElementById('observation-form').requestSubmit()`);
  for(let i=0;i<50;i++){if(await evalJS('__BROOM_INSTALLATION__.step===5'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_INSTALLATION__.brief.selected.geometryPending'),true);
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.events.at(-1).before.loadW===__BROOM_INSTALLATION__.project.events.at(-1).after.loadW'),true);
  const installationExport={project:await evalJS('__BROOM_INSTALLATION__.project')};fs.writeFileSync(path.join(testTmp,'installation-export.json'),JSON.stringify(installationExport));
  const doc=await call('DOM.getDocument');const field=await call('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#journey-import'});await call('DOM.setFileInputFiles',{nodeId:field.nodeId,files:[path.join(testTmp,'installation-export.json')]});
  for(let i=0;i<50;i++){if(await evalJS('!!__BROOM_INSTALLATION__.project.imports?.length'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.imports.length'),1,'Imported original history archived');
  assert.equal(await evalJS('__BROOM_INSTALLATION__.project.observations.length'),2,'Same observations not duplicated on import');
  await evalJS(`__BROOM_INSTALLATION__.go(2);document.getElementById('room-jump').value='0:r0';document.getElementById('room-jump').dispatchEvent(new Event('change'));document.querySelector('[data-room-stage="2"]').click();document.querySelector('[data-room-style="0:r0"][data-style="columns"]').click();document.querySelector('[data-room-stage="1"]').click();document.getElementById('homeowner-capture').open=true`);
  const evidenceDoc=await call('DOM.getDocument');const upload=await call('DOM.querySelector',{nodeId:evidenceDoc.root.nodeId,selector:'#radiator-evidence-files'});await call('DOM.setFileInputFiles',{nodeId:upload.nodeId,files:[path.join(appRoot,'3broomroad-data/photos/08968f54527a305a14c70973df11894c.jpeg')]});
  await evalJS(`document.getElementById('radiator-width').value=900;document.getElementById('radiator-height').value=600;document.getElementById('radiator-evidence-form').requestSubmit()`);
  for(let i=0;i<70;i++){if(await evalJS(`__BROOM_INSTALLATION__.project.observations.some(o=>o.kind==='radiator-evidence')`))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.observations.find(o=>o.kind==='radiator-evidence').widthMm`),900);
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.observations.find(o=>o.kind==='radiator-evidence').attachments[0].dataUrl.startsWith('data:image/jpeg;')`),true);
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.brief.selected.designPending`),true);
  await evalJS(`__BROOM_INSTALLATION__.go(3);document.querySelector('[data-site-side="front"]').click();`);await evalJS(`new Promise(resolve=>{const im=document.querySelector('#site-preference-photo img');if(im.complete&&im.naturalWidth)resolve();else im.onload=resolve;})`);await evalJS(`const im=document.querySelector('#site-preference-photo img'),r=im.getBoundingClientRect();im.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width*.5,clientY:r.top+r.height*.8}));`);
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.household.sitePreferences[0].side`),'front');
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.choices.outdoor`),'courtyard','Photo preference does not invent a new route');
  // Household controls have downstream effects and survive reload; fixtures stay in this isolated profile.
  await evalJS(`__BROOM_INSTALLATION__.go(2);document.getElementById('room-jump').value='1:r01';document.getElementById('room-jump').dispatchEvent(new Event('change'));document.querySelector('[data-cold="1:r01"]').click()`);
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.household.roomFeedback['1:r01'].cold`),true);
  assert.equal(await evalJS(`document.querySelector('[data-cold="1:r01"]').getAttribute('aria-pressed')`),'true');

  await evalJS(`document.querySelector('[data-room-use="1:r01"][data-use="daytime"]').click()`);assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.household.roomFeedback['1:r01'].use`),'daytime');
  assert.equal(await evalJS(`document.getElementById('journey-next-check').textContent.includes('Bedroom 2 feels cold')`),true);
  await evalJS(`__BROOM_INSTALLATION__.go(0);document.querySelector('[data-residents="4"]').click();document.querySelector('[data-habit="morning"]').click();document.querySelector('[data-habit="overlap"]').click()`);
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.summary().includes('4 people live here')&&__BROOM_INSTALLATION__.summary().includes('Bedroom 2')`),true);
  assert.equal(await evalJS(`document.querySelectorAll('[data-habit][aria-pressed=true]').length`),2);
  await evalJS(`document.getElementById('hot-water-routine').open=true;document.getElementById('hot-water-routine').scrollIntoView()`);await new Promise(r=>setTimeout(r,100));fs.writeFileSync(path.join(testTmp,'installation-habit-cards.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`document.getElementById('start-matching').click();const i=BROOM_PROPOSAL.interiorPhotos.findIndex(i=>i.id==='8d1cee4f0ff1f1632f03ce295d77e9eb');document.querySelector('[data-photo-index="'+i+'"]').click();document.querySelector('[data-match-room="f-bed2"]').click();document.getElementById('match-photo').click()`);
  assert.equal(await evalJS(`document.querySelector('[data-photo-index="8"][aria-pressed=true]')===null`),true,'Save advances to another uncertain photo');
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.brief.selected.rooms.find(r=>r.sourceRoomId==='f-bed2').basis`),'photo-estimate');
  assert.equal(await evalJS(`document.getElementById('photo-matching').open`),true,'Matching stays open after saving');
  assert.equal(await evalJS(`document.getElementById('matching-evidence').querySelector('img').src.startsWith('data:image/')`),true);
  assert.equal(await evalJS(`(()=>{const b=document.getElementById('match-photo').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;})()`),true,'Save stays on screen');
  await evalJS(`document.getElementById('match-photo').focus({preventScroll:true})`);await new Promise(r=>setTimeout(r,150));
  fs.writeFileSync(path.join(testTmp,'installation-photo-matching.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  assert.equal(await evalJS(`(()=>{const image=[...document.querySelectorAll('#photo-matching img')].at(-1);return image&&image.complete&&image.naturalWidth>0&&image.src.startsWith('data:image/');})()`),true,'Floorplan reference loads offline');
  await evalJS(`document.getElementById('matching-show-all').click();document.querySelector('[data-photo-index="8"]').click();document.querySelector('[data-match-room="f-bed3"]').click();document.getElementById('match-photo').click();__BROOM_INSTALLATION__.go(5)`);
  assert.equal(await evalJS(`document.querySelector('#journey-content .evidence-record img').src.startsWith('data:image/')`),true,'Replay includes matched source photo');
  await evalJS(`document.getElementById('replay-back').click()`);
  assert.equal(await evalJS(`SolarViz.installation.replay(__BROOM_INSTALLATION__.project,BROOM_PROPOSAL,__BROOM_INSTALLATION__.cursor).choices.photoRooms['8d1cee4f0ff1f1632f03ce295d77e9eb']`),'f-bed2');
  await call('Page.reload');for(let i=0;i<100;i++){if(await evalJS('!!window.__BROOM_INSTALLATION__'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.choices.photoRooms['8d1cee4f0ff1f1632f03ce295d77e9eb']`),'f-bed3');
  assert.equal(await evalJS(`__BROOM_INSTALLATION__.project.household.roomFeedback['1:r01'].cold`),true);
  assert.equal(await evalJS(`document.querySelector('[data-basement]')===null&&document.getElementById('baths')===null`),true,'No unnecessary heating scope or busy-hour question');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  for(let step=0;step<6;step++){await evalJS('__BROOM_INSTALLATION__.go('+step+')');await new Promise(r=>setTimeout(r,75));assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'Phone fits '+step);}
  await evalJS(`__BROOM_INSTALLATION__.go(2)`);assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'Expanded household controls fit phone');fs.writeFileSync(path.join(testTmp,'installation-phone.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`document.querySelector('.room-conversation').scrollIntoView()`);await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(testTmp,'installation-room-cards-phone.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`__BROOM_INSTALLATION__.go(0);document.getElementById('start-matching').click()`);
  assert.equal(await evalJS(`(()=>{const b=document.getElementById('match-photo').getBoundingClientRect(),d=document.getElementById('photo-matching');return b.top>=0&&b.bottom<=innerHeight&&d.scrollWidth<=innerWidth;})()`),true,'Matching save and image fit phone viewport');
  fs.writeFileSync(path.join(testTmp,'installation-matching-phone.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evalJS(`document.getElementById('close-matching').click()`);
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
  await evalJS(`document.getElementById('model-detail').open=true;__BROOM_INSTALLATION__.view.render()`);
  assert.equal(await evalJS(`(()=>{const v=__BROOM_INSTALLATION__.view;v.render();const gl=v.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);let dark=0;for(let i=0;i<p.length;i+=16)if(p[i]<180&&p[i+1]<180)dark++;return dark>100;})()`),true,'Model renders in expanded host at DPR 2');
  assert.equal(await evalJS('Array.from(document.querySelectorAll(".journey-photo img")).every(im=>im.complete&&im.naturalWidth>0)'),true,'Evidence images load offline');
  console.log(root+': guided options, preferences, real capture flow, replay, shared workbench, persistence, photos and phone layout passed');
 }
 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
