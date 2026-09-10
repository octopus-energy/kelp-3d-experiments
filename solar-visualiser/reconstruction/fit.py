#!/usr/bin/env python3
"""Reproducible propose → fit → project → check experiment for 3 Broom Road.
Run with numpy/scipy: python solar-visualiser/reconstruction/fit.py
No network, LLM calls, depth inference or edits to the user's saved app model.
"""
from pathlib import Path
import json, math, hashlib, sys
import numpy as np
from scipy.optimize import least_squares
from model import PARAMS,NAMES,initial,vector,unpack,model,project,world,local
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'3broomroad-data';OUT=DATA/'reconstruction'
E=json.loads((DATA/'reconstruction-observations.json').read_text())
SITE=json.loads((DATA/'solarpotential.json').read_text())
with (DATA/'dsm.asc').open() as f:
 META={}
 for _ in range(6):
  k,v=f.readline().split();META[k.lower()]=float(v)
 GRID=np.loadtxt(f)
ADDR=SITE['property_details']['geocoded_address'];GROUND=SITE['property_details']['altitude']
LOW=np.array([v[1] for v in PARAMS.values()]);HIGH=np.array([v[2] for v in PARAMS.values()]);SIGMA=np.array([v[3] for v in PARAMS.values()])
CAMLOW=np.array([-25,-2,-60,-1.2,-.4,-.15,25,-220]);CAMHIGH=np.array([25,5,-2,1.2,.8,.15,100,220])

def obs(photo,selection=None):
 return [o for o in photo['observations'] if selection is None or o['use'] in selection]
def photo_res(p,cam,photo,selection=None,normalized=True):
 observations=obs(photo,selection);lm=model(p)['landmarks']
 pred=project([lm[o['landmark']] for o in observations],cam)
 target=np.array([o['px'] for o in observations])*E['imageSize']
 delta=pred-target
 if normalized:delta/=np.array([o['sigmaPx'] for o in observations])[:,None]
 return delta.ravel()
def camera_prior(c):return np.array([(c[1]-1.6)/1.5,c[5]/.06,c[7]/150])
def vertical_res(p,c,photo):
 lm=model(p)['landmarks'];res=[]
 for o in photo.get('verticals',[]):
  a=np.array(lm[o['landmark']]);b=a-[0,3,0];pred=project([a,b],c);v=pred[1]-pred[0];v/=np.linalg.norm(v)
  q=np.array(o['end'])-o['start'];q=q/np.linalg.norm(q)
  res.append((v[0]*q[1]-v[1]*q[0])/.002)
 return np.array(res)
def fit_camera(p,photo,selection=None,start=None):
 candidates=[]
 for cu in ([-4,2.6,9] if start is None else [start[0]]):
  for fov in ([40,60,80] if start is None else [start[6]]):
   dist=p['width']*683/(2*math.tan(math.radians(fov)/2)*340)
   c=np.array([cu,1.6,-dist,math.atan2(p['width']/2-cu,dist),math.atan2(3-1.6,dist),0,fov,0]) if start is None else np.array(start)
   c=np.clip(c,CAMLOW+1e-6,CAMHIGH-1e-6)
   r=least_squares(lambda c:np.r_[photo_res(p,c,photo,selection),vertical_res(p,c,photo),camera_prior(c)],c,bounds=(CAMLOW,CAMHIGH),loss='soft_l1',max_nfev=240)
   candidates.append(r)
 return min(candidates,key=lambda r:r.cost).x

def dsm_samples(p,roof_type):
 # Normalized interior samples remain attached to semantic faces as parameters
 # move. Bilinear sampling of ORIGINAL DSM, never app display terrain.
 m=model(p,roof_type);pts=[];ids=[]
 for face in m['faces']:
  if face['id'].startswith('bay'):continue
  ring=np.array([[v['x'],v['y'],v['z']] for v in face['ring']]);a,b,c=ring[:3]
  normal=np.cross(b-a,c-a)
  if abs(normal[1])<1e-8:continue
  for ix,x in enumerate(np.linspace(ring[:,0].min()+.4,ring[:,0].max()-.4,5)):
   for iz,z in enumerate(np.linspace(ring[:,2].min()+.4,ring[:,2].max()-.4,6)):
    if face['id']=='rear-extension' and ix==0 and iz>=4:continue
    y=a[1]-(normal[0]*(x-a[0])+normal[2]*(z-a[2]))/normal[1]
    pts.append([x,y,z]);ids.append(face['id'])
 q=world(pts,p);cs=META['cellsize'];col=(q[:,0]+ADDR['easting']-META['xllcorner'])/cs-.5
 row=(META['yllcorner']+META['nrows']*cs-ADDR['northing']+q[:,2])/cs-.5
 c=np.clip(col.astype(int),0,GRID.shape[1]-2);r=np.clip(row.astype(int),0,GRID.shape[0]-2);dx=col-c;dy=row-r
 y=(1-dy)*((1-dx)*GRID[r,c]+dx*GRID[r,c+1])+dy*((1-dx)*GRID[r+1,c]+dx*GRID[r+1,c+1])-GROUND
 return np.array(pts),y,np.array(ids)
def plan_res(p):
 # Printed internal dimensions constrain the envelope with uncertain wall/rim
 # allowances; plan image pixels are not treated as exact survey coordinates.
 return np.array([(p['width']-.32-4.88)/.18,(p['length']+p['bay_depth']-.35-8.13)/.30,(p['wing_width']-.36-3.00)/.15,(p['extension_end']-p['length']-.25-8.28)/.35])

def structural(p):
 # Coherent bay and positive room/opening proportions. Roofs remain planar
 # by construction; do not optimize free vertex positions.
 return np.array([max(0,p['bay_right']-p['width']+.12)*20,max(0,2*p['bay_chamfer']+p['window_width']+.15-(p['bay_right']-p['bay_left']))*20,max(0,p['window_upper_sill']+p['window_upper_height']+.2-p['eave'])*20])
FIT=[ph for ph in E['photos'] if ph['role']=='fit'];CHECK=[ph for ph in E['photos'] if ph['role']=='check']
def solve_stage(p0,cameras,roof_type,use_dsm):
 x0=np.r_[vector(p0),np.concatenate(cameras)]
 def residual(x):
  p=unpack(x[:len(NAMES)]);cs=x[len(NAMES):].reshape(-1,8)
  r=[(x[:len(NAMES)]-vector(initial()))/SIGMA,structural(p),plan_res(p)]
  for ph,c in zip(FIT,cs):r.extend([photo_res(p,c,ph),vertical_res(p,c,ph),camera_prior(c)])
  if use_dsm:
   pts,y,ids=dsm_samples(p,roof_type)
   # Cap influence from trees, chimneys and mixed edge cells; no use as truth.
   r.append(np.clip((pts[:,1]-y)/.45,-4,4)*np.where(ids=='rear-extension',.08,.35))
  return np.concatenate(r)
 fit=least_squares(residual,x0,bounds=(np.r_[LOW,np.tile(CAMLOW,len(FIT))],np.r_[HIGH,np.tile(CAMHIGH,len(FIT))]),loss='soft_l1',max_nfev=300,ftol=1e-7)
 return unpack(fit.x[:len(NAMES)]),fit.x[len(NAMES):].reshape(-1,8),float(fit.cost),int(fit.nfev)
def assessment(p,cameras,roof_type):
 records=[]
 for ph,c in zip(FIT,cameras):
  r=photo_res(p,c,ph,normalized=False).reshape(-1,2)
  records.append({'imageId':ph['imageId'],'role':'fit','camera':c.tolist(),'rmsePx':float(np.sqrt(np.mean(np.sum(r*r,axis=1)))),'observations':ph['observations']})
 for ph in CHECK:
  c=fit_camera(p,ph,{'pose'})
  r=photo_res(p,c,ph,{'check'},normalized=False).reshape(-1,2)
  records.append({'imageId':ph['imageId'],'role':'check','camera':c.tolist(),'rmsePx':float(np.sqrt(np.mean(np.sum(r*r,axis=1)))),'observations':ph['observations'],'note':'Camera aligned using roof, door and separate vertical-edge directions; window positions withheld from this camera solve and from geometry optimization.'})
 pts,y,ids=dsm_samples(p,roof_type)
 dsm=[]
 for id in dict.fromkeys(ids):
  residual=pts[ids==id,1]-y[ids==id]
  dsm.append({'faceId':str(id),'samples':len(residual),'medianAbsM':float(np.median(abs(residual))),'rmseM':float(np.sqrt(np.mean(residual**2)))})
 return records,dsm

def main():
 OUT.mkdir(exist_ok=True)
 p=initial();cameras=[fit_camera(p,ph) for ph in FIT]
 stages=[]
 def stage(id,label,p,cs,rt,cost=None,nfev=None):
  photos,dsm=assessment(p,cs,rt);m=model(p,rt)
  projected=[]
  for f in m['faces']:
   out=dict(f);ring=world([[q['x'],q['y'],q['z']] for q in f['ring']],p)
   out['ring']=[dict(q,x=float(v[0]),y=float(v[1]),z=float(v[2])) for q,v in zip(f['ring'],ring)];projected.append(out)
  result={'id':id,'label':label,'model':m,'worldFaces':projected,'photos':photos,'dsm':dsm,'cost':cost,'evaluations':nfev}
  stages.append(result)
  print(label,'photo',[round(ph['rmsePx'],2) for ph in photos],'DSM',[round(d['medianAbsM'],2) for d in dsm],flush=True)
 stage('plan','Plan hypothesis',p,cameras,'mono-across')
 p1,c1,cost,nfev=solve_stage(p,cameras,'mono-across',False);stage('photos','Photo refinement',p1,c1,'mono-across',cost,nfev)
 candidates=[]
 for rt in ['mono-across','mono-along']:
  pp,cc,cost,nfev=solve_stage(p1,c1,rt,True);stage(rt,'Photos + DSM · '+rt,pp,cc,rt,cost,nfev);candidates.append((cost,stages[-1]))
 best=min(candidates,key=lambda c:c[0])[1]
 score_gap=abs(candidates[0][0]-candidates[1][0])
 quality={'trainingImproved':all(b['rmsePx']<a['rmsePx'] for a,b in zip(stages[0]['photos'][:2],best['photos'][:2])),'checkWindowsImproved':all(b['rmsePx']<a['rmsePx'] for a,b in zip(stages[0]['photos'][2:],best['photos'][2:])),'rearRoofAmbiguous':score_gap<1,'rearHypothesisScoreGap':score_gap,'extensionDSMConflict':next(d['medianAbsM'] for d in best['dsm'] if d['faceId']=='rear-extension')>.5,'depthUsed':False}
 report={'schemaVersion':1,'propertyId':'3broomroad','status':'candidate-needs-review','evidence':E,'parameterDefinitions':{k:{'initial':v[0],'bounds':[v[1],v[2]],'priorSigma':v[3],'source':v[4]} for k,v in PARAMS.items()},'stages':stages,'recommendedStage':best['id'],'quality':quality,'provenance':{'method':'Assistant-authored semantic hypotheses and pixel observations; SciPy bounded robust least-squares fitting. No depth inference.','inputs':{f:hashlib.sha256((DATA/f).read_bytes()).hexdigest() for f in ['reconstruction-observations.json','solarpotential.json','dsm.asc','floorplan.png']},'selection':'Lowest training objective among the two rear roof hypotheses; check-image window residuals excluded from objective.','limitations':E['uncertainties']+['Rectangular opening envelopes approximate arched frames.','Each roof section is a closed derived shell; overlapping construction joints are not a fabrication-ready CSG model.','The plan defines a basement but its floor elevation remains assumed.','Four front photos share repeated facade geometry; this is a prototype fit, not a surveyed model.','The two rear roof hypotheses have similar scores; their type remains unresolved.','The extension DSM residual is large; rear geometry remains a photo/plan hypothesis.']}}
 (OUT/'run.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
 (OUT/'bundle.js').write_text('// Generated by reconstruction/fit.py. Do not hand-edit.\nwindow.BROOM_RECONSTRUCTION = '+json.dumps(report,separators=(',',':'),allow_nan=False)+';\n')
 (OUT/'candidate.json').write_text(json.dumps(best['model'],indent=2)+'\n')
 print('Recommended',best['id'],'written to',OUT,flush=True)
if __name__=='__main__':main()
