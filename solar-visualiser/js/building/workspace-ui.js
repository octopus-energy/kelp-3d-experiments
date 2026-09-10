window.SolarViz.setupBuildingWorkspace=function({building}){
 const $=id=>document.getElementById(id),panels=[...document.querySelectorAll('[data-workspace-panel]')],tabs=[...document.querySelectorAll('[data-workspace]')];let active='house';
 function select(name,keepSelection=false){if(!panels.some(p=>p.dataset.workspacePanel===name))return;active=name;panels.forEach(p=>p.hidden=p.dataset.workspacePanel!==name);tabs.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workspace===name)));if(!keepSelection)building.selectFloor(null);document.querySelector('.sidebar').scrollTop=0;}
 tabs.forEach(b=>b.onclick=()=>select(b.dataset.workspace));$('bm-go-rooms').onclick=()=>select('rooms');
 $('bm-survey-review').onclick=()=>{$('bm-geometry-prep').click();$('gp-tab-survey')?.click();};
 $('bm-survey-evidence').closest('details').hidden=window.SolarViz.currentProperty.id!=='3broomroad';
 // Display the selected edit controls when scene interaction reveals an editor.
 const watched=['bm-window-edit','bm-wall-edit'],shown=new Map(watched.map(id=>[id,$(id).style.display!=='none']));
 const observer=new MutationObserver(records=>{for(const {target:el} of records){const visible=el.style.display!=='none',wasVisible=shown.get(el.id);shown.set(el.id,visible);if(visible&&!wasVisible){let parent=el.parentElement;while(parent&&parent.id!=='panel-ashp'){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}if(active!=='rooms')select('rooms',true);}}});
 watched.forEach(id=>observer.observe($(id),{attributes:true,attributeFilter:['style']}));
 select('house');return {select};
};
