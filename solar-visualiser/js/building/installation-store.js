// One project shared by the guided journey and technical workbench. Offline first.
(function(){
const D=window.BROOM_PROPOSAL,J=SolarViz.installation,key='kelp:installation:'+D.propertyId+':'+D.revision,legacy='kelp:proposal:'+D.propertyId+':'+D.revision;
let token=null;
function load(){const raw=localStorage.getItem(key);token=raw;if(raw)return J.validate(JSON.parse(raw),D);const old=localStorage.getItem(legacy);return J.create(D,old?SolarViz.proposal.validate(JSON.parse(old),D):undefined);}
function save(project){J.validate(project,D);if(localStorage.getItem(key)!==token)throw Error('This project changed in another tab. Reload to use the latest decisions before saving.');const raw=JSON.stringify(project);localStorage.setItem(key,raw);token=raw;return project;}
// Earlier evidence revisions remain readable without applying them to today's model.
function archives(){
 const prefix='kelp:installation:'+D.propertyId+':',items=[];
 for(let i=0;i<localStorage.length;i++){
  const k=localStorage.key(i);if(!k.startsWith(prefix)||k===key)continue;
  const raw=localStorage.getItem(k);let project=null;
  try{const p=JSON.parse(raw);if(p.kind==='installation-project'&&p.propertyId===D.propertyId&&p.revision===k.slice(prefix.length)&&Array.isArray(p.events)&&Array.isArray(p.observations))project=p;}catch(e){}
  items.push({key:k,revision:k.slice(prefix.length),project});
 }
 return items.sort((a,b)=>String(b.project?.events.at(-1)?.at||'').localeCompare(String(a.project?.events.at(-1)?.at||'')));
}
function archiveRaw(k){if(!archives().some(a=>a.key===k))throw Error('Saved project not found for this home.');return localStorage.getItem(k);}
SolarViz.installationStore={key,load,save,archives,archiveRaw,get persisted(){return token!==null;}};
})();
