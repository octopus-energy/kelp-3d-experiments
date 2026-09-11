const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const app=path.resolve(__dirname,'..'),ctx={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(app,'3broomroad-data/reconstruction/replay-bundle.js'),'utf8'),ctx);
const replay=ctx.window.BROOM_REPLAY,runPath=path.join(app,'3broomroad-data/reconstruction/run.json'),run=JSON.parse(fs.readFileSync(runPath)),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
assert.equal(replay.propertyId,run.propertyId);assert.equal(replay.runSha256,hash(runPath),'Replay must match the recorded run');
assert.equal(new Set(replay.events.map(e=>e.id)).size,replay.events.length);
for(const [file,sha] of Object.entries(replay.sourceFiles))assert.equal(hash(path.join(app,file)),sha,'Replay source changed: '+file);
for(const e of replay.events){assert(run.stages.some(s=>s.id===e.stageId));assert(e.duration>0);assert(e.sources.length);if(e.previousStageId)assert(run.stages.some(s=>s.id===e.previousStageId));}
for(const layers of Object.values(replay.assets))for(const asset of Object.values(layers)){
 assert.equal(asset.sha256,hash(path.join(app,asset.source)));assert.equal(asset.arraySha256,hash(path.join(app,asset.array)));
 const png=Buffer.from(asset.dataUrl.split(',')[1],'base64');assert.equal(crypto.createHash('sha256').update(png).digest('hex'),asset.sha256);assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),683);
}
assert.equal(run.exteriorPass.depthUsed,false);assert.equal(run.exteriorPass.normalConstraintsUsed,true);
assert(replay.events.some(e=>e.status==='Failed rear check'));assert(replay.events.some(e=>e.evidence==='depth'&&e.status==='Diagnostic only'));
console.log('replay: all checks passed');

assert.equal(replay.events.at(-1).stageId,run.recommendedStage,'Latest geometry must ship with its replay');
assert(replay.events.some(e=>e.stageId==='rear-openings'&&e.sources.includes('opening-corrections.json')));
