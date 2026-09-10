#!/usr/bin/env python3
"""Try rear-only refinement; reject it when independent checks or bounds fail.
The near-photo checks become training observations for this trial ONLY. The far
photo's extension corner remains withheld. Never writes the accepted candidate.
"""
import json,math
import numpy as np
from scipy.optimize import least_squares
from model import model,project
from align_rear import landmarks
from fit import DATA,OUT,dsm_samples
report=json.loads((OUT/'run.json').read_text());stage=next(s for s in report['stages'] if s['id']==report['recommendedStage']);p0=stage['model']['parameters'];obs=json.loads((DATA/'rear-observations.json').read_text())['photos'];names=['wing_eave','wing_rise','extension_low','extension_rise'];base=np.array([p0[k] for k in names]);sigma=np.array([.8,.7,.5,.5]);loC=[-20,-1,p0['extension_end']+3,math.pi-1.2,-.4,-.12,25,-180];hiC=[25,4,p0['extension_end']+60,math.pi+1.2,.5,.12,100,180]
def residual(x):
 p={**p0,**dict(zip(names,x[:4]))};m=model(p);lm=landmarks(m);cams=x[4:].reshape(2,8);r=list((x[:4]-base)/sigma)
 for i,(ph,c) in enumerate(zip(obs,cams)):
  points=[o for o in ph['points'] if o['use']=='pose' or i==0]
  r.extend(((project([lm[o['landmark']] for o in points],c)-np.array([o['px'] for o in points])*[1024,683])/5).ravel())
  if i==0:
   a=project([lm['extension-low'],[.75,p['extension_low']+p['extension_rise']*(1-.75/p['wing_width']),p['extension_end']]],c);v=a[1]-a[0];q=np.array(ph['checkEdges'][0]['pixels']);r.extend((v[0]*(q-a[0])[:,1]-v[1]*(q-a[0])[:,0])/np.linalg.norm(v)/5)
  for edge in ph['verticals']:
   a=np.array(lm[edge['landmark']]);v=np.diff(project([a,a-[0,2,0]],c),axis=0)[0];v/=np.linalg.norm(v);q=np.array(edge['end'],float)-edge['start'];q/=np.linalg.norm(q);r.append((v[0]*q[1]-v[1]*q[0])/.006)
  r.extend([(c[1]-1.3)/1.2,c[4]/.15,c[5]/.04,c[7]/100,(c[6]-60)/20])
 pts,y,ids=dsm_samples(p,'both-mono');sel=np.char.startswith(ids,'wing')|(ids=='rear-extension');r.extend(np.clip((pts[sel,1]-y[sel])/.45,-4,4)*.05)
 return np.array(r)
x=np.r_[base,*[ph['camera'] for ph in report['rearReview']['photos']]]
r=least_squares(residual,x,bounds=(np.r_[[3.5,.05,2,.05],loC,loC],np.r_[[6.5,2.2,3.6,1.8],hiC,hiC]),loss='soft_l1',max_nfev=600)
p={**p0,**dict(zip(names,map(float,r.x[:4])))};m=model(p);lm=landmarks(m)
photos=[]
for i,(ph,c) in enumerate(zip(obs,r.x[4:].reshape(2,8))):
 points=[]
 for o in ph['points']:
  q=project([lm[o['landmark']]],c)[0]
  points.append({**o,'use':'fit' if i==0 else o['use'],'projectedPx':q.tolist(),'errorPx':float(np.linalg.norm(q-np.array(o['px'])*[1024,683]))})
 hits=[name for j,name in enumerate(['x','height','distance','yaw','pitch','roll','fov','imageShift']) if min(c[j]-loC[j],hiC[j]-c[j])<.01]
 photos.append({'imageId':ph['imageId'],'camera':c.tolist(),'points':points,'boundHits':hits,'eaveUse':'fit' if i==0 else 'not-used'})
parameter_hits=[name for i,name in enumerate(names) if min(r.x[i]-[3.5,.05,2,.05][i],[6.5,2.2,3.6,1.8][i]-r.x[i])<.01]
corner=next(o['errorPx'] for o in photos[1]['points'] if o['use']=='check')
violations=[]
for opening in m['openings']:
 if opening['id'] in ['rear-door','extension-side-window']:
  if any(v[1]>p['extension_low']+p['extension_rise']*(1-v[0]/p['wing_width']) for v in opening['ring']):violations.append(opening['id']+' extends above the proposed roof')
reasons=[]
if parameter_hits:reasons.append('Geometry bounds reached: '+', '.join(parameter_hits))
if any(ph['boundHits'] for ph in photos):reasons.append('Camera bounds reached')
if corner>10:reasons.append('Withheld far-photo extension corner exceeds 10 px prototype threshold')
reasons.extend(violations)
trial={'schemaVersion':1,'propertyId':'3broomroad','status':'rejected' if reasons else 'needs-review','baseStage':stage['id'],'geometryApplied':False,'parameters':p,'photos':photos,'cost':float(r.cost),'reasons':reasons,'withheldCornerPx':corner,'method':'Rear height/rise refinement with weak DSM and height priors; front geometry/poses frozen. Near-photo corner/eave promoted to fitting evidence for this trial, far-photo corner withheld. Diagnostic check inspected during development, not an untouched benchmark.'}
(OUT/'rear-trial.json').write_text(json.dumps(trial,indent=2,allow_nan=False)+'\n')
print('Rear trial:',trial['status'],'; far-photo corner',round(corner,1),'px;', '; '.join(reasons))
