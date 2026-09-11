// Recorded snapshots + an editorial timeline. No inference or persisted edits.
(function(SV){
'use strict';
const $=id=>document.getElementById(id),story=window.BROOM_REPLAY,review=window.__BROOM_RECONSTRUCTION__;
if(!story||!review){$('step-text').textContent='Replay data is missing. Generate it with reconstruction/prepare_replay.py.';return;}
const events=story.events,ns='http://www.w3.org/2000/svg';
for(const layers of Object.values(story.assets))for(const asset of Object.values(layers)){
 window.__IMAGE_DATAURLS__=window.__IMAGE_DATAURLS__||{};window.__IMAGE_DATAURLS__[asset.id]=asset.dataUrl;
}
let index=0,layer='photo',playing=false,elapsed=0,lastTime=null,frame=null,applying=false;
const total=events.reduce((s,e)=>s+e.duration,0),format=s=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');
const current=()=>events[index];
function pause(){playing=false;lastTime=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;$('replay-play').textContent=index===events.length-1&&elapsed>=current().duration?'Replay again':'Play replay';}
function updateClock(){const before=events.slice(0,index).reduce((s,e)=>s+e.duration,0);$('replay-time').textContent=format(before+elapsed)+' / '+format(total);$('dwell-progress').style.width=Math.min(100,elapsed/current().duration*100)+'%';}
function tick(now){
 if(!playing)return;
 if(lastTime!==null)elapsed+=(now-lastTime)/1000*Number($('replay-speed').value);lastTime=now;
 if(elapsed>=current().duration){if(index===events.length-1){elapsed=current().duration;updateClock();pause();return;}select(index+1,false);}
 updateClock();frame=requestAnimationFrame(tick);
}
function play(){if(playing){pause();return;}if(index===events.length-1&&elapsed>=current().duration)select(0);playing=true;lastTime=null;$('replay-play').textContent='Pause';frame=requestAnimationFrame(tick);}
function stageBy(id){return review.data.stages.find(s=>s.id===id);}
function changes(){
 const e=current(),prev=stageBy(e.previousStageId),now=review.stage;
 $('previous-shape').disabled=!prev;
 if(!prev){$('model-change').textContent='Recorded snapshot · '+now.label.replace('Previous · ','');return;}
 const lines=[];
 if(now.openingReview)lines.push('2 rear windows added','Rear-wing sash: 0.70 × 1.60 m (inferred)');
 if(prev.worldFaces.length!==now.worldFaces.length)lines.push('Rear wing: two slopes → mono-pitch');
 const priority=['extension_low','extension_rise','width','bay_depth','eave','ridge','window_width'];
 for(const k of priority){const a=prev.model.parameters[k],b=now.model.parameters[k];if(Math.abs(a-b)>.005)lines.push(k.replaceAll('_',' ')+': '+a.toFixed(2)+' → '+b.toFixed(2)+' m');}
 $('model-change').textContent=lines.slice(0,3).join(' · ')||'Small parameter changes; see recorded parameters below.';
}
function metric(){
 const e=current(),s=review.stage,ph=s.photos.find(p=>p.imageId===e.imageId);
 const rr=[review.data.rearReview,review.data.previousRearReview].find(r=>r?.stageId===(s.reviewStageId||s.id)),rear=rr?.photos.find(p=>p.imageId===e.imageId);
 let text='Reference only · no calibrated projection in this snapshot';
 if(e.evidence==='aerial')text='White: OS building · Cyan: site extent · Gold: roof hypothesis';
 else if(e.evidence==='plan')text='Printed dimensions anchor scale · wall thickness and levels remain assumptions';
 else if(rear){text='Photo fit '+rear.poseRmsePx.toFixed(1)+' px';if(rear.checkRmsePx!==null)text+=' · Check '+rear.checkRmsePx.toFixed(1)+' px';if(layer==='normals'&&Number.isFinite(rear.normalErrorDeg))text+=' · Normal disagreement '+rear.normalErrorDeg.toFixed(1)+'°';if(rear.boundHits?.length)text+=' · Camera limit: '+rear.boundHits.join(', ');}
 else if(ph)text=(ph.role==='check'?'Excluded window check':'Fitting photo')+' · '+ph.rmsePx.toFixed(1)+' px RMSE';
 if(s.openingReview&&rear)text='Rear window alignment: unresolved · Lower frame fit '+rear.poseRmsePx.toFixed(1)+' px only';
 $('comparison-metric').textContent=text;
}
function evidence(){
 const e=current(),photoMode=!['aerial','plan'].includes(e.evidence);
 $('overlay').setAttribute('viewBox',(e.sourceViewBox||[0,0,1024,683]).join(' '));
 for(const kind of ['photo','aerial','plan'])$(kind+'-view').hidden=kind!==(photoMode?'photo':e.evidence);
 $('layers').hidden=!photoMode;$('blend-control').hidden=!photoMode||layer==='photo';
 $('show-wire').closest('label').hidden=!photoMode;$('show-observations').closest('label').hidden=!photoMode;
 const labels={photo:'LISTING PHOTO',normals:'PREDICTED NORMALS',depth:'RELATIVE DEPTH',aerial:'AERIAL + OS',plan:'LISTING FLOORPLAN'};
 $('evidence-title').textContent='02 / '+labels[photoMode?layer:e.evidence];
 for(const button of document.querySelectorAll('[data-layer]')){button.setAttribute('aria-pressed',String(button.dataset.layer===layer));button.disabled=button.dataset.layer!=='photo'&&!story.assets[e.imageId]?.[button.dataset.layer];}
 $('overlay').querySelectorAll('[data-replay-layer]').forEach(el=>el.remove());
 const asset=story.assets[e.imageId]?.[layer];
 if(photoMode&&asset){
  const img=document.createElementNS(ns,'image');img.dataset.replayLayer='prediction';img.setAttribute('href',SV.imageUrl(asset));img.setAttribute('width','1024');img.setAttribute('height','683');img.setAttribute('preserveAspectRatio','none');img.setAttribute('opacity',Number($('layer-opacity').value)/100);$('overlay').querySelector('image').after(img);
  if(layer==='normals'&&$('show-observations').checked){
   const rear=review.data.rearReview.photos.find(p=>p.imageId===e.imageId);
   // Show the actual fitted source patch, also when inspecting its predecessor.
   if(rear&&!$('overlay').querySelector('rect')){const box=rear.normal.box,rect=document.createElementNS(ns,'rect');rect.dataset.replayLayer='patch';for(const [key,val] of Object.entries({x:box[0],y:box[1],width:box[2]-box[0],height:box[3]-box[1],fill:'none',stroke:'#c5a2ff','stroke-width':2}))rect.setAttribute(key,val);$('overlay').appendChild(rect);}
  }
 }
 $('opacity-value').textContent=$('layer-opacity').value+'%';
 $('layer-note').textContent=!photoMode?(e.evidence==='aerial'?'OS site extent does not establish ownership. Roof and wall outlines need not coincide.':'The source plan is a marketing plan. It does not establish net room areas or surveyed heights.'):
 layer==='depth'?'Predicted relative log depth · diagnostic only, not used to fit this model. Colours are not metres.':
 layer==='normals'?'Predicted camera-space directions. Purple box: brick patch used as a weak constraint in the final rear fit. Front maps are diagnostic only.':
 'Gold: model edges · Cyan: fitting observations · Green: excluded checks · Dashed grey: unvalidated context';
 $('asset-provenance').textContent=asset?'Preview: '+asset.source+' · SHA-256 '+asset.sha256+' · Raw array: '+asset.array+' · '+asset.encoding:'';
 if(review.stage.openingReview&&photoMode&&e.imageId?.startsWith('d234'))$('layer-note').textContent='Gold polygons: visible source frames · Dashed purple: provisional model windows. Close-up exposes upper-wall alignment errors.';
 metric();
}
function apply(){
 applying=true;
 const e=current();
 $('show-dsm').checked=!!e.dsm;$('show-openings').checked=e.openings!==false;
 review.select({stageId:e.stageId,imageId:e.imageId,previousStageId:$('previous-shape').checked?e.previousStageId:null});
 $(e.view).click();
 $('step-count').textContent=String(index+1).padStart(2,'0')+' / '+String(events.length).padStart(2,'0');
 $('step-status').textContent=e.status;$('step-title').textContent=e.title;$('step-text').textContent=e.text;
 $('source-references').textContent='Source records: '+e.sources.join(' · ');
 $('replay-scrub').value=index;$('replay-scrub').setAttribute('aria-valuetext',(index+1)+': '+e.title);
 $('replay-prev').disabled=index===0;$('replay-next').disabled=index===events.length-1;
 for(const [i,button] of [...$('replay-steps').children].entries()){if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');}
 const active=$('replay-steps').children[index];$('replay-steps').scrollLeft=active.offsetLeft-$('replay-steps').offsetLeft-$('replay-steps').clientWidth/2+active.clientWidth/2;
 changes();evidence();updateClock();history.replaceState(null,'','#'+e.id);applying=false;
}
function select(next,stop=true){if(stop)pause();index=Math.max(0,Math.min(events.length-1,next));elapsed=0;lastTime=null;layer=['normals','depth'].includes(current().evidence)?current().evidence:'photo';apply();}
$('replay-scrub').max=events.length-1;
for(const [i,e] of events.entries()){const button=document.createElement('button'),number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');button.append(number,document.createTextNode(e.label));button.title=e.title;button.onclick=()=>select(i);$('replay-steps').appendChild(button);}
$('replay-prev').onclick=()=>select(index-1);$('replay-next').onclick=()=>select(index+1);$('replay-play').onclick=play;$('replay-scrub').oninput=()=>select(Number($('replay-scrub').value));
for(const button of document.querySelectorAll('[data-layer]'))button.onclick=()=>{pause();layer=button.dataset.layer;evidence();};
$('layer-opacity').oninput=()=>{pause();evidence();};
$('previous-shape').onchange=()=>{pause();review.select({stageId:current().stageId,imageId:current().imageId,previousStageId:$('previous-shape').checked?current().previousStageId:null});evidence();};
// The shared renderer reconstructs the SVG on overlay changes. Restore our layer.
for(const id of ['show-wire','show-observations'])$(id).addEventListener('change',()=>{pause();evidence();});
for(const id of ['front','rear','above','show-dsm','show-openings'])$(id).addEventListener('click',()=>{if(!applying)pause();});
$('view3d').addEventListener('pointerdown',pause);
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
document.addEventListener('keydown',e=>{if(/INPUT|SELECT|BUTTON|TEXTAREA|SUMMARY|A/.test(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();play();}else if(e.code==='ArrowRight'){e.preventDefault();select(index+1);}else if(e.code==='ArrowLeft'){e.preventDefault();select(index-1);}});
const requested=events.findIndex(e=>'#'+e.id===location.hash);select(requested<0?0:requested);
window.addEventListener('hashchange',()=>{const next=events.findIndex(e=>'#'+e.id===location.hash);if(next>=0&&next!==index)select(next);});
window.__BROOM_REPLAY__={select,play,pause,get index(){return index;},get playing(){return playing;},get layer(){return layer;},events,story};
})(window.SolarViz);
