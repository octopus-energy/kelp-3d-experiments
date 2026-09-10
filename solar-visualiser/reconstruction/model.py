"""Broom Road prototype: explicit building hypotheses in house-local metres.
X = right when looking at front, Y = up, Z = towards rear (left-handed).
The property transform converts this to the app's east/up/south frame.
All meshes/landmarks are derived; evidence and parameter values are inputs.
"""
import math
import numpy as np

# value, lower bound, upper bound, prior sigma, evidence / interpretation
PARAMS = {
 'width': (5.20,4.8,5.7,.16,'OS footprint and first-floor printed width'),
 'length': (7.45,6.8,8.2,.22,'ground-floor plan, printed living/dining length'),
 'eave': (5.65,4.8,6.8,.45,'DSM and front facade'),
 'ridge': (7.7,6.7,8.8,.35,'DSM'),
 'bay_left': (1.9,1.3,2.4,.25,'floorplan bay outline'),
 'bay_right': (4.85,4.3,5.3,.20,'floorplan bay outline'),
 'bay_chamfer': (.55,.25,.95,.18,'floorplan bay outline'),
 'bay_depth': (.80,.35,1.4,.22,'floorplan outline; oblique front photos'),
 'bay_rise': (.45,.15,1.0,.25,'hipped cap visible in front photo 88a6310f'),
 'door_x': (.80,.35,1.45,.20,'front photo and ground-floor hall'),
 'door_width': (.94,.7,1.15,.12,'front photo; approximate frame rectangle'),
 'door_bottom': (.30,-.3,1.0,.25,'front steps; local ground datum uncertain'),
 'door_height': (2.35,1.9,2.8,.18,'front photo'),
 'window_width': (1.10,.75,1.55,.17,'central bay windows in front photos'),
 'window_lower_sill': (1.0,.55,1.5,.20,'front photo'),
 'window_lower_height': (1.8,1.3,2.25,.20,'front photo'),
 'window_upper_sill': (3.65,3.0,4.2,.25,'front photo'),
 'window_upper_height': (1.8,1.3,2.25,.20,'front photo'),
 'wing_width': (3.36,3.0,3.8,.13,'3.00 m printed internal width plus wall thickness'),
 'wing_end': (12.55,11.8,13.6,.28,'first-floor bedroom/bathroom outline'),
 'wing_eave': (4.65,3.5,6.0,.4,'DSM; rear attribution uncertain'),
 'wing_rise': (1.05,.5,1.7,.35,'pitched roof hypothesis and DSM'),
 'extension_end': (15.95,15.0,17.0,.30,'8.28 m printed kitchen/living max length'),
 'extension_low': (2.6,2.0,3.6,.30,'interior ceiling / rear opening; provisional'),
 'extension_rise': (.55,.05,1.3,.3,'rooflight visible inside; mono-pitch hypothesis'),
 'anchor_x': (3.35,2.7,4.2,.08,'OS front/south corner in property frame'),
 'anchor_z': (3.70,3.0,4.4,.08,'OS front/south corner in property frame'),
 'bearing': (18.07,14.0,22.0,.25,'OS wall orientation, degrees east of north'),
}
NAMES=list(PARAMS)
def initial(): return {k:v[0] for k,v in PARAMS.items()}
def vector(p): return np.array([p[k] for k in NAMES])
def unpack(v): return dict(zip(NAMES,map(float,v)))
def world(points,p):
 pts=np.asarray(points,dtype=float);a=math.radians(p['bearing']);u=np.array([math.sin(a),0,-math.cos(a)]);v=np.array([-math.cos(a),0,-math.sin(a)])
 return pts[:,0,None]*u+pts[:,1,None]*[0,1,0]+pts[:,2,None]*v+[p['anchor_x'],0,p['anchor_z']]
def local(points,p):
 pts=np.asarray(points)-[p['anchor_x'],0,p['anchor_z']];a=math.radians(p['bearing']);return np.array([pts[:,0]*math.sin(a)-pts[:,2]*math.cos(a),pts[:,1],-pts[:,0]*math.cos(a)-pts[:,2]*math.sin(a)]).T

def model(p,roof_type='both-mono'):
 W,L,H=p['width'],p['length'],p['eave'];bl,br,bh,bd=p['bay_left'],p['bay_right'],p['bay_chamfer'],p['bay_depth']
 faces=[];lm={};openings=[]
 def face(id,ring,confidence='constrained'):
  faces.append({'id':id,'name':id.replace('-',' '),'active':True,'confidence':confidence,'ring':[{'id':id+':'+str(i),'x':float(x),'y':float(y),'z':float(z)} for i,(x,y,z) in enumerate(ring)]})
 face('main-front',[(0,H,0),(W,H,0),(W,p['ridge'],L/2),(0,p['ridge'],L/2)])
 face('main-rear',[(0,p['ridge'],L/2),(W,p['ridge'],L/2),(W,H,L),(0,H,L)])
 bay=[(bl,H,0),(bl+bh,H,-bd),(br-bh,H,-bd),(br,H,0)]
 peak=((bl+br)/2,H+p['bay_rise'],-bd*.25)
 for i in range(4):face('bay-hip-'+str(i),[bay[i],bay[(i+1)%4],peak],'photo-and-plan')
 ww,we,wh,wr=p['wing_width'],p['wing_end'],p['wing_eave'],p['wing_rise']
 if roof_type=='both-mono':
  # Confirmed roof form from the user and rear listing photos. The two-plane
  # gable is retained only when replaying the archived first-pass hypotheses.
  face('wing-mono',[(0,wh+wr,L),(ww,wh,L),(ww,wh,we),(0,wh+wr,we)],'user-confirmed-form-DSM-pitch')
 else:
  face('wing-left',[(0,wh,L),(ww/2,wh+wr,L),(ww/2,wh+wr,we),(0,wh,we)],'superseded-gable-hypothesis')
  face('wing-right',[(ww/2,wh+wr,L),(ww,wh,L),(ww,wh,we),(ww/2,wh+wr,we)],'superseded-gable-hypothesis')
 ee=p['extension_end'];outline=[(0,we),(ww,we),(ww,ee),(.75,ee),(.75,ee-1.2),(0,ee-1.2)]
 def ext_y(x,z):
  t=(1-x/ww) if roof_type=='both-mono' else x/ww if roof_type=='mono-across' else (z-we)/(ee-we)
  return p['extension_low']+p['extension_rise']*t
 face('rear-extension',[(x,ext_y(x,z),z) for x,z in outline],'user-confirmed-form-approximate-pitch' if roof_type=='both-mono' else 'superseded-slope-hypothesis')
 for key,point in zip(['bay_root_left','bay_front_left','bay_front_right','bay_root_right'],bay):lm[key]=point
 lm.update(front_left=(0,H,0),front_right=(W,H,0),bay_peak=peak)
 # Four-corner observations use frame bounds, not the curved brick arch.
 def opening(id,x0,x1,y0,y1,z,kind='window',confidence='photo-fitted'):
  pts=[(x0,y1,z),(x1,y1,z),(x1,y0,z),(x0,y0,z)]
  for suffix,point in zip(['tl','tr','br','bl'],pts):lm[id+'_'+suffix]=point
  openings.append({'id':id,'kind':kind,'confidence':confidence,'ring':[list(q) for q in pts]})
 opening('front-door',p['door_x']-p['door_width']/2,p['door_x']+p['door_width']/2,p['door_bottom'],p['door_bottom']+p['door_height'],0,'door')
 cx=(bl+br)/2
 for level in ['lower','upper']:
  opening('bay-'+level,cx-p['window_width']/2,cx+p['window_width']/2,p['window_'+level+'_sill'],p['window_'+level+'_sill']+p['window_'+level+'_height'],-bd)
 # Side lights follow the bay construction. Their widths are approximate,
 # explicitly inferred rather than counted as measured photo observations.
 for level in ['lower','upper']:
  y=p['window_'+level+'_sill'];h=p['window_'+level+'_height']
  for side,(a,b) in enumerate([(bay[0],bay[1]),(bay[2],bay[3])]):
   a=np.array(a);b=np.array(b);q=a+(b-a)*.2;r=a+(b-a)*.8
   openings.append({'id':'bay-'+level+'-side-'+str(side),'kind':'window','confidence':'inferred','ring':[[q[0],y+h,q[2]],[r[0],y+h,r[2]],[r[0],y,r[2]],[q[0],y,q[2]]]})
 opening('basement-window',cx-.5,cx+.5,-1.5,-.2,-bd,confidence='photo-observed-size-assumed')
 opening('rear-door',.95,ww-.45,.25,2.35,ee,'door','plan-and-photo-unfitted')
 if 'rear_door_left' in p:
  # The visible opening has a sloping glazed head. Keep the archived rectangular
  # hypothesis exactly reproducible when these optional parameters are absent.
  x0,x1=p['rear_door_left'],p['rear_door_right'];bottom=p['rear_door_bottom']
  pts=[(x0,ext_y(x0,ee)-p['rear_head_gap'],ee),(x1,ext_y(x1,ee)-p['rear_head_gap'],ee),(x1,bottom,ee),(x0,bottom,ee)]
  for suffix,point in zip(['tl','tr','br','bl'],pts):lm['rear-door_'+suffix]=point
  openings[-1].update(ring=[list(q) for q in pts],confidence='rear-photo-fitted',note='Sloping outer frame envelope; fascia/head allowance assumed, not measured.')
 # Printed first-floor plan places a window in the rear bedroom end wall.
 opening('rear-bedroom',ww/2-.55,ww/2+.55,3.2,min(4.55,wh+wr*(.5-.55/ww)-.15) if roof_type=='both-mono' else 4.55,we,confidence='plan-and-photo-unfitted')
 # Unfitted secondary openings are explicit hypotheses linked to plan/photo
 # evidence; they remain visually distinguishable in the review.
 def side_opening(id,z0,z1,y0,y1,kind='window'):
  openings.append({'id':id,'kind':kind,'confidence':'plan-and-photo-unfitted','ring':[[ww,y1,z0],[ww,y1,z1],[ww,y0,z1],[ww,y0,z0]]})
 side_opening('kitchen-side-window',L+2.0,L+4.6,1.0,2.25)
 side_opening('extension-side-window',ee-1.8,ee-.65,1.0,min(2.2,p['extension_low']-.15) if 'rear_door_left' in p else 2.2)
 if 'rear_door_left' in p:
  openings[-1].update(confidence='inferred-roof-limited',note='Unfitted side opening; assumed head allowance 0.15 m below revised roof. Height is not a photo measurement.')
 side_opening('bathroom-side-window',L+.5,L+1.5,3.3,min(4.55,wh-.15) if roof_type=='both-mono' else 4.55)
 rooflight=[(1.2,ee-2.7),(2.3,ee-2.7),(2.3,ee-1.7),(1.2,ee-1.7)]
 openings.append({'id':'extension-rooflight','kind':'rooflight','confidence':'plan-and-interior-unfitted','ring':[[x,ext_y(x,z)+.025,z] for x,z in rooflight]})
 return {'faces':faces,'landmarks':{k:list(v) for k,v in lm.items()},'openings':openings,'parameters':p,'roofType':roof_type}

def project(points,cam):
 cu,cy,cv,yaw,pitch,roll,fov=cam[:7]
 shift=cam[7] if len(cam)>7 else 0
 f=np.array([math.sin(yaw)*math.cos(pitch),math.sin(pitch),math.cos(yaw)*math.cos(pitch)])
 r=np.array([math.cos(yaw),0,-math.sin(yaw)]);up=np.cross(f,r)
 rr=r*math.cos(roll)+up*math.sin(roll);uu=up*math.cos(roll)-r*math.sin(roll)
 q=np.asarray(points)-[cu,cy,cv];z=q@f;focal=683/2/math.tan(math.radians(fov)/2)
 return np.array([512+focal*(q@rr)/np.maximum(z,.1),341.5+shift-focal*(q@uu)/np.maximum(z,.1)]).T
