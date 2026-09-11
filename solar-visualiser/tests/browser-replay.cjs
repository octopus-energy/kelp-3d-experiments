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
  await call('Page.navigate',{url:root+'/replay.html'});
  for(let i=0;i<120;i++){if(await evalJS('!!window.__BROOM_REPLAY__'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('!!window.__BROOM_REPLAY__'),true,'Replay initialises');
  await new Promise(r=>setTimeout(r,300));
  const initialCanvas=await evalJS(`(()=>{const pane=document.getElementById('view3d'),canvas=pane.querySelector('canvas');return {paneHeight:pane.clientHeight,canvasHeight:canvas.clientHeight,bufferHeight:canvas.height,dpr:devicePixelRatio};})()`);
  console.log('Initial replay canvas',initialCanvas);
  assert(initialCanvas.paneHeight<650,'Retina canvas must not expand its flex container');
  assert.equal(initialCanvas.canvasHeight,initialCanvas.paneHeight,'Canvas fits its host');
  assert.equal(await evalJS(`(()=>{const r=__BROOM_RECONSTRUCTION__;r.render();const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let bright=0;for(let i=0;i<pixels.length;i+=16)if(pixels[i]>75&&pixels[i+1]>75&&pixels[i+2]>75)bright++;return bright>1000;})()`),true,'Initial aerial step visibly renders model surfaces');
  fs.writeFileSync(path.join(testTmp,'replay-initial-retina.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const saved=await evalJS('JSON.stringify({...localStorage})');
  assert.equal(await evalJS('__BROOM_REPLAY__.index'),0);
  assert.equal(await evalJS('document.getElementById("aerial-view").hidden'),false);
  assert.equal(await evalJS('document.querySelectorAll("#replay-steps button").length'),14);
  for(let step=0;step<14;step++){
   await evalJS(`__BROOM_REPLAY__.select(${step})`);
   assert.equal(await evalJS('__BROOM_RECONSTRUCTION__.stage.id===__BROOM_REPLAY__.events[__BROOM_REPLAY__.index].stageId'),true);
   assert.equal(await evalJS('document.getElementById("errors").textContent'),'');
   assert.equal(await evalJS('document.querySelectorAll("#replay-steps [aria-current=step]").length'),1);
   assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'No horizontal page overflow');
  }
  for(const [step,name] of [[3,'front-fit'],[8,'depth'],[10,'normals'],[11,'rear-check'],[12,'rear-openings']]){
   await evalJS(`__BROOM_REPLAY__.select(${step})`);
   await new Promise(r=>setTimeout(r,350));
   const hrefs=await evalJS('[...document.querySelectorAll("#overlay image")].map(e=>e.getAttribute("href"))');
   assert.equal(hrefs.every(h=>h.startsWith('data:image/')),true,'Every displayed image is embedded');
   assert.equal(await evalJS(`Promise.all([...document.querySelectorAll('#overlay image')].map(el=>new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im.naturalWidth>0);im.onerror=()=>resolve(false);im.src=el.getAttribute('href');}))).then(xs=>xs.every(Boolean))`),true,'Source layers decode offline');
   if(step===8||step===10)assert.equal(hrefs.length,2);
   fs.writeFileSync(path.join(testTmp,'replay-'+name+'.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  }
  await evalJS(`__BROOM_REPLAY__.select(10);document.getElementById('show-wire').click()`);
  assert.equal(await evalJS('document.querySelectorAll("#overlay image").length'),2,'Layer survives wireframe refresh');
  assert.equal(await evalJS('document.querySelectorAll("#overlay rect").length'),1,'Exactly one annotated normal patch');
  await evalJS(`document.getElementById('show-wire').click();document.getElementById('previous-shape').click()`);
  assert.equal(await evalJS(`(()=>{let n=0;__BROOM_RECONSTRUCTION__.scene.traverse(o=>{if(o.userData.replayPrevious)n++;});return n;})()`),0);
  await evalJS(`document.getElementById('previous-shape').click()`);
  assert.equal(await evalJS(`(()=>{let n=0;__BROOM_RECONSTRUCTION__.scene.traverse(o=>{if(o.userData.replayPrevious)n++;});return n;})()`),1);
  await evalJS(`__BROOM_REPLAY__.select(8);document.getElementById('replay-speed').value='2';document.getElementById('replay-play').click()`);
  await new Promise(r=>setTimeout(r,4700));
  assert.equal(await evalJS('__BROOM_REPLAY__.index'),9,'Playback advances automatically');
  assert.equal(await evalJS('__BROOM_REPLAY__.playing'),true,'Automatic view changes do not pause playback');
  await evalJS(`document.getElementById('replay-play').click();document.querySelector('[data-layer="depth"]').click()`);
  assert.equal(await evalJS('__BROOM_REPLAY__.playing'),false);
  assert.equal(await evalJS('__BROOM_REPLAY__.layer'),'depth');
  await evalJS(`document.getElementById('replay-scrub').value=11;document.getElementById('replay-scrub').dispatchEvent(new Event('input'))`);
  assert.equal(await evalJS('__BROOM_REPLAY__.index'),11);
  assert.equal(await evalJS('JSON.stringify({...localStorage})'),saved,'Replay never modifies saved models');
  await call('Page.navigate',{url:root+'/replay.html#rear-refine'});
  for(let i=0;i<120;i++){if(await evalJS('window.__BROOM_REPLAY__?.index===10'))break;await new Promise(r=>setTimeout(r,100));}
  assert.equal(await evalJS('__BROOM_REPLAY__.index'),10,'Deep link reopens selected event');
  await call('Emulation.setDeviceMetricsOverride',{width:720,height:1000,deviceScaleFactor:1,mobile:false});
  await new Promise(r=>setTimeout(r,200));
  assert.equal(await evalJS('document.documentElement.scrollWidth<=innerWidth'),true,'Narrow layout fits viewport');
  fs.writeFileSync(path.join(testTmp,'replay-narrow.png'),Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:2,mobile:false});
  console.log(root+': replay snapshots, layers, playback, scrubbing, deep links, responsive layout and read-only storage passed');
 }
 assert.deepEqual(errors,[]);await send('Target.closeTarget',{targetId});ws.close();
})().catch(e=>{console.error(e);process.exit(1)});
