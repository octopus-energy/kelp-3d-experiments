#!/usr/bin/env python3
"""Inventory a dataset without inventing missing evidence or borrowing geometry.
Usage: python prepare_evidence.py PATH [--output PATH]
Any directory is accepted for evidence intake; reconstruction requires a reviewed
property adapter and observations. Generated outputs never overwrite raw inputs.
"""
from pathlib import Path
import argparse,hashlib,json,re

def build(data):
 data=Path(data).resolve()
 if not data.is_dir():raise ValueError('Dataset directory does not exist')
 def read(name):
  path=data/name
  return json.loads(path.read_text()) if path.exists() else None
 case=read('workflow-observations.json');pid=case['propertyId'] if case else re.sub('[^a-z0-9-]','-',data.name.lower())
 sources=[]
 for name,kind in [('osdata.json','os'),('solarpotential.json','solar-survey'),('dsm.asc','dsm'),('floorplan.png','plan'),('aerial.png','aerial'),('image-manifest.json','image-index'),('reconstruction-observations.json','interpretation'),('rear-observations.json','rear-annotation'),('workflow-observations.json','workflow-annotation')]:
  path=data/name
  if path.is_file():sources.append({'id':kind,'path':name,'kind':kind,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'status':'provided','captureDate':None})
 manifest=read('image-manifest.json') or {}
 for im in manifest.get('images',[]):
  path=(data/im['file']).resolve()
  if not path.is_relative_to(data):raise ValueError('Image path escapes dataset')
  sources.append({'id':im['id'],'path':im['file'],'kind':im.get('kind','unclassified-image'),'sha256':hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None,'status':'provided' if path.is_file() else 'missing','caption':im.get('caption',''),'captureDate':None})
 # Prediction previews and prepared copies are derived from listing photos.
 # Inventory their package manifest once, never count them as independent views.
 prediction_roots=[]
 for path in sorted(data.rglob('manifest.json')):
  if 'reconstruction' in path.relative_to(data).parts:continue
  try:prediction=json.loads(path.read_text())
  except (ValueError,OSError):continue
  if prediction.get('kind')=='monocular-prediction-evidence':
   prediction_roots.append(path.parent)
   name=path.relative_to(data).as_posix()
   sources.append({'id':'prediction:'+name,'path':name,'kind':'monocular-predictions','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'status':'derived-not-independent','captureDate':None})
 # Include unclassified images even without a listing manifest.
 known={s['path'] for s in sources}
 for path in sorted(data.rglob('*')):
  if any(part in ['reconstruction','.git'] for part in path.relative_to(data).parts):continue
  if any(path.is_relative_to(root) for root in prediction_roots):continue
  if path.is_file() and path.suffix.lower() in ['.jpg','.jpeg','.png','.webp','.pdf','.tif','.tiff'] and path.relative_to(data).as_posix() not in known:
   name=path.relative_to(data).as_posix();sources.append({'id':'file:'+name,'path':name,'kind':'unclassified','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'status':'needs-classification','captureDate':None})
 os=read('osdata.json');site=read('solarpotential.json');os_evidence=None
 if os:
  building=os.get('building_outline',{});land=os.get('site_outline',{});properties=building.get('properties',{})
  os_evidence={'building':building,'site':land,'crs':'EPSG:27700','crsStatus':'adapter-assumption-confirm-with-provider','interpretation':'Mapped building and auto-defined site extents; neither establishes roof overhang, internal rooms or legal ownership. Attributes retain their original capture methods, sources and dates.','facts':{k:properties.get(k) for k in ['description','connectivity','numberoffloors','basementpresence','buildingage_period','constructionmaterial','geometry_area_m2','geometry_updatedate']}}
  if site:
   addr=site['property_details']['geocoded_address']
   def convert(coords):
    if len(coords)>=2 and isinstance(coords[0],(int,float)):return [coords[0]-addr['easting'],addr['northing']-coords[1]]
    return [convert(c) for c in coords]
   os_evidence['buildingLocal']=convert(building['geometry']['coordinates']);os_evidence['siteLocal']=convert(land['geometry']['coordinates']);os_evidence['frame']='property-relative east/south metres'
 candidate=data/'reconstruction'/'candidate.json'
 model_revision=hashlib.sha256(candidate.read_bytes()).hexdigest() if candidate.is_file() else None
 digest=hashlib.sha256(json.dumps({'sources':sources,'modelRevision':model_revision},sort_keys=True).encode()).hexdigest()
 missing=[k for k in ['os','dsm','plan','image-index'] if not any(s['kind']==k for s in sources)]
 return {'schemaVersion':1,'propertyId':pid,'revision':digest,'modelRevision':model_revision,'sources':sources,'missingEvidence':missing,'os':os_evidence,'case':case,'readiness':'needs-interpretation' if not case else 'survey-planning','automationStatus':'Evidence intake only; no generic automatic geometry reconstruction. Broom Road uses its reviewed property-specific adapter.'}

def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('dataset',type=Path);ap.add_argument('--output',type=Path);args=ap.parse_args();data=args.dataset.resolve();out=(args.output or data/'reconstruction').resolve();out.mkdir(parents=True,exist_ok=True)
 if out==data:raise ValueError('Output must be separate from raw dataset root')
 report=build(data)
 (out/'workflow.json').write_text(json.dumps(report,indent=2,allow_nan=False)+'\n');(out/'workflow-bundle.js').write_text('// Generated by reconstruction/prepare_evidence.py.\nwindow.RECONSTRUCTION_WORKFLOW = '+json.dumps(report,separators=(',',':'),allow_nan=False)+';\n')
 print('Evidence:',report['propertyId'],len(report['sources']),'sources;',report['readiness'],'; missing:',', '.join(report['missingEvidence']) or 'none of the intake categories')
if __name__=='__main__':main()
