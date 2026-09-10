// Reviewed Broom Road plan tracing. Suggestions only: preview before applying.
// Pixel coordinates refer to the original 1040 × 1080 floorplan.png.
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./floorplan.js'));else root.SolarViz.planIntake=factory(root.SolarViz.buildingFloorplan);})(typeof window!=='undefined'?window:globalThis,function(FP){
'use strict';
const definitions={
 ground:{anchor:[365,987],width:291,outline:[[365,987],[365,145],[413,145],[413,76],[551,76],[551,553],[656,553],[656,987],[629,987],[589,1031],[521,1031],[485,987]],dividers:[[[365,553],[551,553]],[[441,987],[441,786],[474,786],[474,553]]],labels:{'g-kitchen':[460,340],'g-hall':[400,850],'g-living':[550,850]}},
 first:{anchor:[724,987],width:288,outline:[[724,987],[724,255],[908,255],[908,553],[1012,553],[1012,987],[972,987],[935,1031],[858,1031],[822,987]],dividers:[[[724,788],[1012,788]],[[828,788],[828,553],[890,553]],[[724,483],[785,483],[785,431],[908,431]],[[785,483],[756,513],[766,553],[908,553]]],labels:{'f-bed1':[900,880],'f-bed2':[920,670],'f-bed3':[820,350],'f-bath':[850,500],'f-landing':[770,660]}},
 'lower-ground':{anchor:[17,987],width:290,outline:[[17,552],[307,552],[307,987],[275,987],[236,1031],[169,1031],[135,987],[17,987]],dividers:[[[89,987],[89,786],[307,786]],[[17,852],[89,852]],[[75,552],[75,727],[89,727],[89,786]],[[129,552],[129,630],[307,630]]],labels:{'lg-study':[200,880],'lg-store':[50,930],'lg-utility':[200,700],'lg-shower':[220,590],'lg-circulation':[45,700]}}
};
function forLevel(workflow,level){if(level?.isAttic)return null;const key=level?.kind==='lower-ground'?'lower-ground':['ground','first'][level?.idx],d=definitions[key];if(workflow?.propertyId!=='3broomroad'||!d)return null;
 const rooms=(workflow.case?.rooms||[]).filter(r=>r.level===key).map(r=>({id:r.id,label:r.name,labelAt:d.labels[r.id],type:r.id.includes('bed')?'bedroom':r.id.includes('bath')||r.id.includes('shower')?'bathroom':r.id.includes('hall')||r.id.includes('landing')?'hallway':r.id.includes('kitchen')?'kitchen':r.id.includes('store')?'storage':'living'}));
 if(key==='lower-ground')rooms.push({id:'lg-circulation',label:'Circulation / stairs',labelAt:d.labels['lg-circulation'],type:'hallway'});
 return {...JSON.parse(JSON.stringify(d)),level:level.idx,key,rooms,strict:true,source:'floorplan.png; reviewed wall-centre tracing, 2026-09-10. Gross shell alignment; wall thickness and stair voids unverified.'};
}
function transform(plan,parameters,origin){const angle=parameters.bearing*Math.PI/180-Math.PI/2,scale=parameters.width/plan.width,T={scale,angle,mirrored:false,q:0,tx:0,tz:0};const at=FP.applyToPoint(T,plan.anchor);T.tx=origin.x+parameters.anchor_x-at[0];T.tz=origin.z+parameters.anchor_z-at[1];return T;}
return {forLevel,transform};
});
