#!/usr/bin/env python3
"""Regression: check observations cannot influence the fitted candidate."""
import copy,json,unittest
import numpy as np
from refine_exterior import fit,landmarks,line_res,DATA,OUT,HERE
from model import model

class ExteriorTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  report=json.loads((OUT/'run.json').read_text());cls.p=next(s['model']['parameters'] for s in report['stages'] if s['id']=='rear-corrected')
  cls.e=json.loads((HERE/'exterior-observations.json').read_text());cls.normals=[p['normal'] for p in report['exteriorPass']['photos']]
 def test_withheld_observations_change_diagnostics_not_fit(self):
  original=copy.deepcopy(self.e);a=fit(self.p,self.e,self.normals);changed=copy.deepcopy(self.e)
  for ph in changed['photos']:
   for o in ph['points']:
    if o['use']=='check':o['pixels']=[o['pixels'][0]+70,o['pixels'][1]-55]
   if ph['eaveUse']=='check':ph['eavePixels']=[[x,y+55] for x,y in ph['eavePixels']]
  b=fit(self.p,changed,self.normals)
  self.assertEqual(a['parameters'],b['parameters']);self.assertEqual(a['cost'],b['cost'])
  self.assertEqual(a['status'],'candidate-needs-review');self.assertEqual(b['status'],'rejected')
  self.assertEqual(self.e,original)
 def test_landmarks_match_sloped_frame_and_fascia_convention(self):
  p={**self.p,'rear_door_left':.85,'rear_door_right':2.5,'rear_door_bottom':.3,'rear_head_gap':.23}
  lm=landmarks(p,self.e);m=model(p);self.assertEqual(lm['door-left-top'],m['landmarks']['rear-door_tr'])
  self.assertAlmostEqual(lm['extension-low'][1]+self.e['assumptions']['fasciaDepthM'],p['extension_low'])
 def test_line_distance_is_not_endpoint_agreement(self):
  np.testing.assert_allclose(line_res([[100,2],[200,2]],[[0,0],[1,0]]),[2,2])
  with self.assertRaises(ValueError):line_res([[0,0]],[[1,1],[1,1]])

if __name__=='__main__':unittest.main()
