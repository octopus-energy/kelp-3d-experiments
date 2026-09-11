#!/usr/bin/env python3
"""Append evidence-linked rear opening hypotheses without refitting the shell.
The exterior-refined stage remains byte-for-byte identical in the run.
"""
import copy
import hashlib
import json
from pathlib import Path
HERE=Path(__file__).resolve().parent
DATA=HERE.parent/'3broomroad-data'
OUT=DATA/'reconstruction'

def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write(path,value):path.write_text(json.dumps(value,indent=2,allow_nan=False)+'\n')

def revise(report,observations):
 if report['propertyId']!=observations['propertyId']:raise ValueError('Wrong property')
 base=next(s for s in report['stages'] if s['id']==observations['baseStageId'])
 stage=copy.deepcopy(base);p=stage['model']['parameters'];changes=[]
 stage.update(id=observations['stageId'],label='Exterior · rear window hypotheses',reviewStageId=base['id'],fitScope='Opening completeness and proportions from user feedback; dimensions assumed. No shell or camera fitting.',frontFitUnchanged=True)
 for edit in observations['openings']:
  previous=next((o for o in stage['model']['openings'] if o['id']==edit['id']),None)
  if (edit['operation']=='replace')!=(previous is not None):raise ValueError('Opening operation does not match base')
  if edit['wall']=='main-rear-exposed':
   centre=(p['wing_width']+p['width'])/2;z=p['length'];xmin=p['wing_width'];xmax=p['width']
  elif edit['wall']=='wing-end':
   centre=sum(v[0] for v in previous['ring'])/len(previous['ring']);z=p['wing_end'];xmin=0;xmax=p['wing_width']
  else:raise ValueError('Unknown wall')
  left,right=centre-edit['width']/2,centre+edit['width']/2
  if not xmin<left<right<xmax or not 0<edit['bottom']<edit['top']:raise ValueError('Opening outside wall')
  roof=p['eave'] if edit['wall']=='main-rear-exposed' else p['wing_eave']+p['wing_rise']*(1-right/p['wing_width'])
  if edit['top']>roof-.05:raise ValueError('Opening crosses roof')
  ring=[[left,edit['top'],z],[right,edit['top'],z],[right,edit['bottom'],z],[left,edit['bottom'],z]]
  opening={'id':edit['id'],'kind':'window','confidence':edit['confidence'],'ring':ring,'note':edit['reason'],'evidence':'opening-corrections.json','dimensionStatus':'assumed-not-measured'}
  stage['model']['openings']=[opening if o['id']==edit['id'] else o for o in stage['model']['openings']]
  if previous is None:stage['model']['openings'].append(opening)
  for suffix,point in zip(['tl','tr','br','bl'],ring):stage['model']['landmarks'][edit['id']+'_'+suffix]=point
  changes.append({'id':edit['id'],'before':copy.deepcopy(previous),'after':copy.deepcopy(opening),'reason':edit['reason']})
 stage['openingReview']={'status':'provisional-unfitted','baseStageId':base['id'],'changes':changes,'observations':observations,'cameraScope':'Inherited lower-extension diagnostics; not validation of these openings.'}
 result=copy.deepcopy(report);result['stages']=[s for s in result['stages'] if s['id']!=stage['id']]+[stage];result['recommendedStage']=stage['id']
 result['quality']['rearOpeningValidation']='provisional-user-correction';result['provenance']['limitations']=list(dict.fromkeys(result['provenance']['limitations']+observations['limitations']))
 return result,stage

def main():
 source=DATA/'opening-corrections.json';observations=json.loads(source.read_text());report=json.loads((OUT/'run.json').read_text())
 for record in observations['sources']:
  path=DATA/record['path']
  if not path.resolve().is_relative_to(DATA.resolve()):raise ValueError('Source escapes property')
  record['sha256']=sha(path)
 result,stage=revise(report,observations)
 result['provenance']['inputs']['opening-corrections.json']=sha(source)
 for record in observations['sources']:result['provenance']['inputs'][record['path']]=record['sha256']
 write(OUT/'run.json',result);write(OUT/'candidate.json',stage['model']);write(OUT/'opening-pass.json',stage['openingReview'])
 print('Rear openings: two added, rear-bedroom proportions revised; shell and cameras frozen.')
if __name__=='__main__':main()
