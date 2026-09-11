// One project shared by the guided journey and technical workbench. Offline first.
(function(){
const D=window.BROOM_PROPOSAL,J=SolarViz.installation,key='kelp:installation:'+D.propertyId+':'+D.revision,legacy='kelp:proposal:'+D.propertyId+':'+D.revision;
let token=null;
function load(){const raw=localStorage.getItem(key);token=raw;if(raw)return J.validate(JSON.parse(raw),D);const old=localStorage.getItem(legacy);return J.create(D,old?SolarViz.proposal.validate(JSON.parse(old),D):undefined);}
function save(project){J.validate(project,D);if(localStorage.getItem(key)!==token)throw Error('This project changed in another tab. Reload to use the latest decisions before saving.');const raw=JSON.stringify(project);localStorage.setItem(key,raw);token=raw;return project;}
SolarViz.installationStore={key,load,save};
})();
