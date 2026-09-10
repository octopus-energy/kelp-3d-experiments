#!/usr/bin/env python3
"""Verify imported monocular evidence and measure explicitly selected normal patches.
No fitting, geometry changes, torch/CUDA, or modification of the supplied package.
Usage: python inspect_predictions.py PACKAGE --photos PHOTO_DIR --output OUTPUT_DIR
Needs NumPy and Pillow. Region and candidate arguments are optional.
"""
from pathlib import Path
import argparse,base64,hashlib,html,json,math
import numpy as np
from PIL import Image,ImageOps
HERE=Path(__file__).resolve().parent

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()

def inside(root,name):
 p=(root/name).resolve()
 if not p.is_relative_to(root.resolve()):raise ValueError('Evidence path escapes its root: '+str(name))
 return p

def unit(v):
 v=np.asarray(v,dtype=float);length=np.linalg.norm(v,axis=-1,keepdims=True)
 if not np.isfinite(v).all() or np.any(length<1e-8):raise ValueError('Invalid/zero normal vector')
 return v/length

def angle(a,b):return float(np.degrees(np.arccos(np.clip(np.dot(unit(a),unit(b)),-1,1))))

def patch(normals,box):
 x0,y0,x1,y1=box
 if not (0<=x0<x1<=normals.shape[2] and 0<=y0<y1<=normals.shape[1]):raise ValueError('Region outside native image')
 vectors=unit(normals[:,y0:y1,x0:x1].reshape(3,-1).T)
 centre=unit(np.median(vectors,axis=0));deviation=np.degrees(np.arccos(np.clip(vectors@centre,-1,1)))
 return {'normal':centre.tolist(),'pixels':len(vectors),'medianDeviationDeg':float(np.median(deviation)),'p90DeviationDeg':float(np.percentile(deviation,90))}

def camera_normal(normal,c):
 # Convention hypothesis: image right, image up, toward camera. Checked against
 # front orientation; still provisional, not a calibration of the predictor.
 yaw,pitch,roll=c[3:6]
 f=np.array([math.sin(yaw)*math.cos(pitch),math.sin(pitch),math.cos(yaw)*math.cos(pitch)])
 r=np.array([math.cos(yaw),0,-math.sin(yaw)]);u=np.cross(f,r)
 rr=r*math.cos(roll)+u*math.sin(roll);uu=u*math.cos(roll)-r*math.sin(roll)
 n=np.array(normal);return unit([n@rr,n@uu,-n@f])

def audit(package,photos):
 package=package.resolve();photos=photos.resolve();manifest=json.loads((package/'manifest.json').read_text())
 if manifest.get('kind')!='monocular-prediction-evidence':raise ValueError('Unsupported prediction manifest')
 if not manifest.get('images'):raise ValueError('Prediction package contains no images')
 if len({r['id'] for r in manifest['images']})!=len(manifest['images']):raise ValueError('Duplicate image IDs')
 modalities=manifest.get('settings',{}).get('modalities',[])
 if not modalities or any(m not in ['depth','normals','albedo','depth_seethrough'] for m in modalities):raise ValueError('Unsupported modalities')
 issues=[];rows=[]
 lock=package/'asset-lock.json';lock_ok=lock.is_file() and sha(lock)==manifest.get('environment',{}).get('asset_lock_sha256')
 if not lock_ok:issues.append('Asset-lock manifest hash mismatch or absent')
 for row in manifest['images']:
  record={'source':row['source'],'id':row['id'],'size':row['input_size'],'outputs':{},'errors':[]}
  try:
   source=inside(photos,row['source']);prepared=inside(package,row['input'])
   if sha(source)!=row['source_sha256']:raise ValueError('Source file hash mismatch')
   if sha(prepared)!=row['input_sha256']:raise ValueError('Prepared input hash mismatch')
   with Image.open(source) as im:rgb=ImageOps.exif_transpose(im).convert('RGB')
   if hashlib.sha256(str(rgb.size).encode()+rgb.tobytes()).hexdigest()!=row['pixel_sha256']:raise ValueError('Decoded source pixel hash mismatch')
   if list(rgb.size)!=row['oriented_size']:raise ValueError('Oriented source size mismatch')
   with Image.open(prepared) as im:
    if list(im.size)!=row['input_size']:raise ValueError('Prepared input size mismatch')
  except (OSError,ValueError,KeyError) as e:record['errors'].append(str(e))
  for modality in manifest['settings']['modalities']:
   try:
    info=row['outputs'][modality];npy=inside(package,info['npy']);png=inside(package,info['png'])
    if sha(npy)!=info['npy_sha256'] or sha(png)!=info['png_sha256']:raise ValueError('Output hash mismatch')
    a=np.load(npy,allow_pickle=False);w,h=row['input_size'];shape=(3,h,w) if modality in ['normals','albedo'] else (h,w)
    if a.shape!=shape or a.dtype!=np.float32 or not np.isfinite(a).all():raise ValueError('Invalid array shape, dtype or nonfinite values')
    if np.std(a)<1e-6:raise ValueError('Constant prediction')
    with Image.open(png) as im:
     if im.size!=(w,h):raise ValueError('Preview size differs from array')
    stats={'shape':list(a.shape),'dtype':str(a.dtype),'encoding':info['encoding'],'range':[float(a.min()),float(a.max())],'npySha256':sha(npy)}
    if modality=='normals':
     lengths=np.linalg.norm(a,axis=0);stats['lengthPercentiles']=np.percentile(lengths,[1,50,99]).tolist()
     if np.any(lengths<1e-8):raise ValueError('Zero normals')
     if not .9<float(np.median(lengths))<1.1:raise ValueError('Unexpected normal magnitudes')
    record['outputs'][modality]=stats
   except (OSError,ValueError,KeyError) as e:record['errors'].append(modality+': '+str(e))
  issues.extend(row['source']+': '+e for e in record['errors']);rows.append(record)
 return manifest,{'schemaVersion':1,'status':'integrity-passed' if not issues else 'integrity-failed','propertyId':manifest['settings']['property_id'],'manifestSha256':sha(package/'manifest.json'),'assetLockVerified':lock_ok,'modelWeightsLocallyVerified':False,'upstreamCommit':manifest.get('environment',{}).get('upstream_commit'),'tasks':manifest['tasks'],'imageCount':len(rows),'arrayCount':sum(len(r['outputs']) for r in rows),'issues':issues,'images':rows,'geometryApplied':False,'accuracyValidated':False}

def regions_report(package,manifest,regions,candidate):
 by_source={r['source']:r for r in manifest['images']};views=[]
 stage=next(s for s in candidate['stages'] if s['id']==candidate['recommendedStage']) if candidate else None
 for view in regions['views']:
  row=by_source[view['source']];a=np.load(inside(package,row['outputs']['normals']['npy']),allow_pickle=False)
  result={**view,'regions':[{**r,**patch(a,r['box'])} for r in view['regions']]};measured={r['id']:r for r in result['regions']}
  if 'planePair' in view:
   v=[measured[id]['normal'] for id in view['planePair']];result['opposingPlaneDepartureDeg']=180-angle(*v)
  if 'cameraCheck' in view and stage:
   cameras=stage['photos'] if view['cameraCheck']['role']=='front' else candidate['rearReview']['photos']
   camera=next(ph['camera'] for ph in cameras if ph['imageId']==Path(row['source']).stem);normal=camera_normal(view['cameraCheck']['localNormal'],camera)
   result['expectedCameraNormal']=normal.tolist();result['camera']=camera
   for region in result['regions']:region['candidateAngularDifferenceDeg']=angle(normal,region['normal'])
  views.append(result)
 return views

def report_html(package,manifest,report,out):
 by_source={r['source']:r for r in manifest['images']}
 def data(path):return 'data:image/png;base64,'+base64.b64encode(path.read_bytes()).decode()
 blocks=[]
 for view in report.get('regionChecks',[]):
  row=by_source[view['source']];w,h=row['input_size'];figures=[]
  for title,file in [('Input photo',row['input']),('Predicted normals',row['outputs']['normals']['png'])]:
   rectangles=''.join(f'<rect x="{r["box"][0]}" y="{r["box"][1]}" width="{r["box"][2]-r["box"][0]}" height="{r["box"][3]-r["box"][1]}" fill="none" stroke="{["#ffd166","#13dddd"][i%2]}" stroke-width="3"><title>{html.escape(r["label"])}</title></rect>' for i,r in enumerate(view['regions']))
   figures.append(f'<figure><figcaption>{title}</figcaption><svg viewBox="0 0 {w} {h}"><image href="{data(inside(package,file))}" width="{w}" height="{h}"/>{rectangles}</svg></figure>')
  values=''.join('<tr><td>'+html.escape(r['label'])+'</td><td>'+str(round(r['p90DeviationDeg'],1))+'°</td><td>'+(str(round(r['candidateAngularDifferenceDeg'],1))+'°' if 'candidateAngularDifferenceDeg' in r else '—')+'</td></tr>' for r in view['regions'])
  note=f'<p>Departure from opposing parallel normals: <strong>{view["opposingPlaneDepartureDeg"]:.1f}°</strong>. This is a prediction-consistency diagnostic, not a measured ceiling pitch.</p>' if 'opposingPlaneDepartureDeg' in view else '<p>Angular disagreement with the frozen candidate camera; both the predictor and camera can be wrong.</p>'
  blocks.append('<section><h2>'+html.escape(view['label'])+'</h2><div class="pair">'+''.join(figures)+'</div><table><tr><th>Sampled patch</th><th>90% of normals within</th><th>Candidate difference</th></tr>'+values+'</table>'+note+'</section>')
 page='''<!doctype html><meta charset="utf-8"><title>Marigold raw-array audit</title><style>body{font:16px system-ui;background:#111d26;color:#e6edf2;max-width:1400px;margin:25px auto;padding:20px;line-height:1.5}h1{font-size:26px}h2{font-size:20px}section{border-top:1px solid #4b6171;padding:22px 0}.pair{display:flex;gap:16px}figure{margin:0;flex:1;min-width:0}svg{width:100%}figcaption{color:#abc4d6;margin:8px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:10px;border-bottom:1px solid #354a59}p{max-width:1000px}@media(max-width:700px){.pair{display:block}}</style><h1>Marigold raw-array audit</h1>'''
 page+=f'<p>{report["imageCount"]} source images · {report["arrayCount"]} verified arrays · {report["status"]}. Source/input/array/preview hashes and dimensions checked. Model weights are represented by their supplied lock file; weights were not available for local verification.</p>'
 page+='<p>Yellow/cyan rectangles show the exact hand-selected patches. Low within-patch variation is not proof of accuracy. Depth is relative log depth; see-through depth remains separate. No geometry was changed.</p>'+''.join(blocks)
 (out/'monocular-audit.html').write_text(page)

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('package',type=Path);ap.add_argument('--photos',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--regions',type=Path);ap.add_argument('--candidate',type=Path);args=ap.parse_args()
 package=args.package.resolve();out=args.output.resolve()
 if out==package or out.is_relative_to(package):raise ValueError('Keep audit output outside supplied evidence package')
 manifest,report=audit(package,args.photos);out.mkdir(parents=True,exist_ok=True)
 if not report['issues'] and args.regions:
  regions=json.loads(args.regions.read_text())
  if regions.get('propertyId')!=report['propertyId']:raise ValueError('Region annotations belong to another property')
  candidate=json.loads(args.candidate.read_text()) if args.candidate else None
  if candidate and candidate.get('propertyId')!=report['propertyId']:raise ValueError('Candidate belongs to another property')
  report['regionChecks']=regions_report(package,manifest,regions,candidate)
  report['regionAnnotationsSha256']=sha(args.regions)
  if args.candidate:report['candidateSha256']=sha(args.candidate)
  report['normalFrameHypothesis']='image right / image up / toward camera; front comparison supports compatibility, not independently calibrated'
 (out/'monocular-audit.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
 if report['issues']:raise SystemExit('\n'.join(report['issues']))
 report_html(package,manifest,report,out)
 print(report['status'],report['imageCount'],'images',report['arrayCount'],'arrays')
 for view in report.get('regionChecks',[]):print(view['label'],view.get('opposingPlaneDepartureDeg',[r.get('candidateAngularDifferenceDeg') for r in view['regions']]))
if __name__=='__main__':main()
