#!/usr/bin/env python3
"""Rear extension refinement with reviewed pixels and weak raw normal constraints.
Frozen front and upper wing. Every candidate remains a review hypothesis; saves a
new stage only when diagnostic checks, bounds and opening containment pass.
"""
import copy,hashlib,json,math
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from model import model,project,world
from fit import DATA,OUT,dsm_samples
from inspect_predictions import audit,patch,camera_normal,angle,sha
HERE=Path(__file__).resolve().parent
NAMES=['extension_low','extension_rise','rear_door_left','rear_door_right','rear_door_bottom']
# Geometry is roof-top height; annotation points are fascia undersides.
BASE=np.array([2.65,.8,.95,2.55,.25]);SIGMA=np.array([.4,.5,.25,.2,.15])
LOW=np.array([1.9,.1,.55,2.0,.05]);HIGH=np.array([3.6,1.8,1.5,3.1,.65])

def line_res(points,segment):
 a,b=np.asarray(segment);v=b-a
 if np.linalg.norm(v)<1e-8:raise ValueError('Degenerate projected line')
 q=np.asarray(points)-a
 return (v[0]*q[:,1]-v[1]*q[:,0])/np.linalg.norm(v)

def landmarks(p,e):
 z=p['extension_end'];w=p['wing_width'];a=e['assumptions'];roof=lambda x:p['extension_low']+p['extension_rise']*(1-x/w)
 x0,x1=p['rear_door_left'],p['rear_door_right'];gap=p['rear_head_gap'];bottom=p['rear_door_bottom']
 return {'door-left-bottom':[x1,bottom,z],'door-right-bottom':[x0,bottom,z],
 'door-left-top':[x1,roof(x1)-gap,z],'door-right-top':[x0,roof(x0)-gap,z],
 'extension-low':[w,roof(w)-a['fasciaDepthM'],z],
 'extension-high':[.75,roof(.75)-a['fasciaDepthM'],z],
 'main-eave-left':[p['width'],p['eave'],p['length']], 'main-eave-right':[0,p['eave'],p['length']]}

def fit(p0,e,normal_records,use_normals=True):
 a=e['assumptions'];lowc=np.array([-20,-1,p0['extension_end']+2,2.,-.4,-.1,25,-220]);highc=np.array([15,3.5,p0['extension_end']+45,4.1,.4,.1,110,220])
 low=np.r_[LOW,lowc,lowc];high=np.r_[HIGH,highc,highc]
 def params(x):return {**p0,**dict(zip(NAMES,map(float,x[:5]))),'rear_head_gap':a['fasciaDepthM']+a['headBelowFasciaM']}
 def residual(x):
  p=params(x);lm=landmarks(p,e);r=list((x[:5]-BASE)/SIGMA)
  r.append((lm['door-left-top'][1]-lm['door-left-bottom'][1]-a['nominalDoorLowSideHeightM'])/a['nominalDoorHeightSigmaM'])
  for ph,n,c in zip(e['photos'],normal_records,x[5:].reshape(2,8)):
   for ob in ph['points']:
    if ob['use']=='fit':r.extend((project([lm[ob['landmark']]],c)[0]-ob['pixels'])/ob['sigmaPx'])
   if ph['eaveUse']=='fit':r.extend(line_res(ph['eavePixels'],project([lm['extension-low'],lm['extension-high']],c))/4)
   r.extend(line_res(ph['mainEavePixels'],project([lm['main-eave-left'],lm['main-eave-right']],c))/5)
   if use_normals:r.extend((camera_normal([0,0,1],c)-n['normal'])/math.radians(a['normalSigmaDeg']))
   r.extend([(c[1]-1.3)/1.2,c[4]/.2,c[5]/.04,c[7]/120,(c[6]-65)/25])
  return np.array(r)
 starts=[]
 for distance in [6,12,22]:
  for far_x,far_yaw in [(-4,2.8),(4,3.15),(10,3.5)]:
   cams=[[0,1.3,p0['extension_end']+distance,2.95,-.1,0,65,-60],[far_x,1.3,p0['extension_end']+distance*2,far_yaw,-.1,0,50,50]]
   result=least_squares(residual,np.r_[BASE,*cams],bounds=(low,high),loss='soft_l1',max_nfev=600)
   starts.append(result)
 result=min(starts,key=lambda s:s.cost);p=params(result.x);lm=landmarks(p,e);photos=[]
 for ph,n,c in zip(e['photos'],normal_records,result.x[5:].reshape(2,8)):
  records=[]
  for o in ph['points']:
   q=project([lm[o['landmark']]],c)[0];records.append({**o,'px':(np.array(o['pixels'])/[1024,683]).tolist(),'projectedPx':q.tolist(),'errorPx':float(np.linalg.norm(q-o['pixels']))})
  segment=project([lm['extension-low'],lm['extension-high']],c);edge_error=float(np.mean(abs(line_res(ph['eavePixels'],segment))))
  errors=[o['errorPx'] for o in records if o['use']=='check'];hits=[name for j,name in enumerate(['x','height','distance','yaw','pitch','roll','fov','imageShift']) if min(c[j]-lowc[j],highc[j]-c[j])<.01]
  overlays=[{'id':'extension-fascia','ring':[lm['extension-low'],lm['extension-high']],'status':'visible'}]
  keys=['door-left-top','door-right-top','door-right-bottom','door-left-bottom']
  for j,key in enumerate(keys):overlays.append({'id':'rear-frame-'+str(j),'ring':[lm[key],lm[keys[(j+1)%4]]],'status':'visible'})
  for f in model(p)['faces']:
   if f['id'] not in ['wing-mono','rear-extension']:continue
   ring=[[v['x'],v['y'],v['z']] for v in f['ring']]
   for j,v in enumerate(ring):overlays.append({'id':f['id']+':'+str(j),'ring':[v,ring[(j+1)%len(ring)]],'status':'unvalidated-or-occluded'})
  photos.append({'imageId':ph['imageId'],'camera':c.tolist(),'landmarks':lm,'points':records,'poseRmsePx':float(np.sqrt(np.mean([o['errorPx']**2 for o in records if o['use']=='fit']))),'checkRmsePx':float(np.sqrt(np.mean(np.square(errors)))) if errors else None,'checkThresholdPx':10,'boundHits':hits,'normal':n,'normalErrorDeg':angle(camera_normal([0,0,1],c),n['normal']),'checkEdges':[{'id':'extension-fascia','pixels':ph['eavePixels'],'use':ph['eaveUse'],'meanDistancePx':edge_error,'projectedSegmentPx':segment.tolist()}],'mainEaveMeanDistancePx':float(np.mean(abs(line_res(ph['mainEavePixels'],project([lm['main-eave-left'],lm['main-eave-right']],c))))),'overlayEdges':overlays,'status':'diagnostic-pass' if not hits and all(x<10 for x in errors) and (ph['eaveUse']!='check' or edge_error<8) else 'failed-check'})
 hits=[name for j,name in enumerate(NAMES) if min(result.x[j]-LOW[j],HIGH[j]-result.x[j])<.01]
 # Positive, planar frames must lie below the roof at every corner. No clamping
 # an invalid proposal into apparent validity after fitting.
 violations=[]
 for o in model(p)['openings']:
  if o['id'] in ['rear-door','extension-side-window']:
   for v in o['ring']:
    roof=p['extension_low']+p['extension_rise']*(1-v[0]/p['wing_width'])
    if v[1]>=roof-.01:violations.append(o['id']+' crosses roof')
 reasons=[]
 if hits:reasons.append('Geometry bounds reached: '+', '.join(hits))
 if any(ph['status']=='failed-check' for ph in photos):reasons.append('A camera bound or diagnostic photo check failed')
 reasons.extend(sorted(set(violations)))
 return {'parameters':p,'photos':photos,'cost':float(result.cost),'seedCosts':[float(s.cost) for s in starts],'parameterBoundHits':hits,'reasons':reasons,'status':'rejected' if reasons else 'candidate-needs-review','normalConstraintsUsed':use_normals}

def main():
 report=json.loads((OUT/'run.json').read_text());base=next(s for s in report['stages'] if s['id']=='rear-corrected');source=HERE/'exterior-observations.json';e=json.loads(source.read_text());package=DATA/e['package']
 manifest,integrity=audit(package,DATA/'photos')
 if integrity['issues']:raise ValueError('Prediction package failed verification: '+str(integrity['issues']))
 if e['propertyId']!=report['propertyId'] or integrity['propertyId']!=e['propertyId']:raise ValueError('Property mismatch')
 normal_records=[];inputs={}
 for ph in e['photos']:
  row=next(r for r in manifest['images'] if Path(r['source']).stem==ph['imageId']);file=package/row['outputs']['normals']['npy']
  normal_records.append({**patch(np.load(file,allow_pickle=False),ph['normalBox']),'box':ph['normalBox'],'sourceSha256':row['source_sha256'],'arraySha256':sha(file)})
  inputs[file.relative_to(DATA).as_posix()]=sha(file)
 for f in [source,package/'manifest.json',package/'asset-lock.json']:
  if f.is_relative_to(DATA):inputs[f.relative_to(DATA).as_posix()]=sha(f)
 result=fit(base['model']['parameters'],e,normal_records);control=fit(base['model']['parameters'],e,normal_records,False)
 result.update(schemaVersion=1,propertyId=e['propertyId'],stageId='exterior-refined',baseStage=base['id'],geometryApplied=False,observations=e,annotationsSha256=sha(source),packageIntegrity=integrity['status'],depthUsed=False,frontFitUnchanged=True,upperWingUnchanged=True,accuracyValidated=False,controlWithoutNormals={k:control[k] for k in ['cost','parameters','photos','status','reasons','parameterBoundHits','seedCosts']})
 report['provenance']['annotationHashes']={'exterior-observations.json':sha(source)}
 result['limitations']=[
  'Visible lower extension and frame checks improve; this does not validate the occluded upper wing or certify whole-exterior dimensions.',
  'Old upper junctions were retired because full-width corner attribution was unverified. Upper-wing geometry remains the earlier hypothesis.',
  'Main eave evidence constrains a line only; partially hidden endpoints and property attribution remain provisional.',
  'Roof/fascia allowance, door height, camera priors and plan dimensions carry scale uncertainty. No site measurements were supplied.',
  'Raw normals are weak correlated evidence from the photos, not independent metric observations. Depth and see-through depth are not fitted.',
  'OS footprint narrows on a different rear side from the listing plan; source date/attribution discrepancy remains unresolved. Roof overhang is separate.',
  'Front photo agreement is preserved. The unfitted extension side window follows the revised roof with an assumed 0.15 m head allowance. Its dimensions, other secondary openings, basement ground contact and hidden interfaces need survey review.',
  'Photo checks have been inspected during development and are diagnostics, not an untouched benchmark. No interior geometry was changed.'
 ]
 if not result['reasons']:
  p=result['parameters'];m=model(p);stage=copy.deepcopy(base);stage.update(id='exterior-refined',label='Exterior · rear refinement',model=m,cost=result['cost'],fitScope='Rear lower roof and glazed frame; weak normals and photo edge constraints. Front and upper wing frozen.',frontFitUnchanged=True)
  stage['worldFaces']=[]
  for face in m['faces']:
   points=world([[q['x'],q['y'],q['z']] for q in face['ring']],p)
   stage['worldFaces'].append({**face,'ring':[{**q,'x':float(v[0]),'y':float(v[1]),'z':float(v[2])} for q,v in zip(face['ring'],points)]})
  pts,y,ids=dsm_samples(p,'both-mono');stage['dsm']=[]
  for id in dict.fromkeys(ids):
   delta=pts[ids==id,1]-y[ids==id];stage['dsm'].append({'faceId':str(id),'samples':len(delta),'medianAbsM':float(np.median(abs(delta))),'rmseM':float(np.sqrt(np.mean(delta**2)))})
  report['stages']=[s for s in report['stages'] if s['id']!=stage['id']]+[stage];report['recommendedStage']=stage['id']
  if report['rearReview']['stageId']==base['id']:report['previousRearReview']=report['rearReview']
  report['rearReview']={'stageId':stage['id'],'status':'partial-diagnostic-pass','geometryChanged':True,'photos':result['photos']}
  report['quality'].update(normalConstraintsUsed=True,depthUsed=False,wholeExteriorValidated=False,upperRearPhotoValidation='occluded-unverified',rearLowerPhotoValidation='diagnostic-pass',frontFitUnchanged=True)
  for name in ['rear_door_left','rear_door_right','rear_door_bottom','rear_head_gap']:
   report['parameterDefinitions'][name]={'initial':None,'source':'Rear frame photo fit with plan and explicit construction priors; not surveyed'}
  report['provenance']['inputs'].update(inputs)
  report['provenance']['limitations']=list(dict.fromkeys([v for v in report['provenance']['limitations'] if not v.startswith('Both rear roofs are mono-pitch;')]+result['limitations']))
  report['provenance']['selection']='New rear lower extension candidate passes visible-feature diagnostics with frozen front and upper wing. Whole exterior remains unvalidated.'
  (OUT/'candidate.json').write_text(json.dumps(m,indent=2,allow_nan=False)+'\n')
 result['candidateSelected']=not result['reasons'];report['exteriorPass']=result
 (OUT/'exterior-pass.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n')
 (OUT/'run.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
 (OUT/'bundle.js').write_text('// Generated by reconstruction/run.py.\nwindow.BROOM_RECONSTRUCTION = '+json.dumps(report,separators=(',',':'),allow_nan=False)+';\n')
 print('Exterior:',result['status'],result['reasons'])
 for ph in result['photos']:print(ph['imageId'][:6],'fit',round(ph['poseRmsePx'],2),'checks',ph['checkRmsePx'],'eave',round(ph['checkEdges'][0]['meanDistancePx'],2),'normal',round(ph['normalErrorDeg'],2),'bounds',ph['boundHits'])
 print('Parameters:',{k:round(result['parameters'][k],3) for k in NAMES})
if __name__=='__main__':main()
