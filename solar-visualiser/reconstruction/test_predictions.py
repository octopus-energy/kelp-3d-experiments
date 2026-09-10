import json,tempfile,unittest
from pathlib import Path
import numpy as np
from PIL import Image
from inspect_predictions import audit,angle,camera_normal,patch,sha,inside
import hashlib

class PredictionTests(unittest.TestCase):
 def fixture(self,root):
  package=root/'package';photos=root/'photos';package.mkdir();photos.mkdir()
  rgb=Image.new('RGB',(8,6),(100,120,140));source=photos/'a.png';rgb.save(source);rgb.save(package/'input.png');rgb.save(package/'normals.png')
  a=np.zeros((3,6,8),dtype=np.float32);a[2]=1;np.save(package/'normals.npy',a);(package/'asset-lock.json').write_text('{}')
  manifest={'kind':'monocular-prediction-evidence','settings':{'property_id':'fixture','modalities':['normals']},'tasks':{},'environment':{'asset_lock_sha256':sha(package/'asset-lock.json')},'images':[{'id':'a','source':'a.png','source_sha256':sha(source),'input':'input.png','input_sha256':sha(package/'input.png'),'pixel_sha256':hashlib.sha256(str(rgb.size).encode()+rgb.tobytes()).hexdigest(),'oriented_size':[8,6],'input_size':[8,6],'outputs':{'normals':{'npy':'normals.npy','png':'normals.png','npy_sha256':sha(package/'normals.npy'),'png_sha256':sha(package/'normals.png'),'encoding':'camera XYZ'}}}]}
  (package/'manifest.json').write_text(json.dumps(manifest));return package,photos,manifest
 def test_verified_arrays_are_not_accuracy_certificate(self):
  with tempfile.TemporaryDirectory() as d:
   package,photos,_=self.fixture(Path(d));_,result=audit(package,photos);self.assertEqual(result['status'],'integrity-passed');self.assertEqual(result['arrayCount'],1);self.assertFalse(result['accuracyValidated']);self.assertFalse(result['geometryApplied'])
 def test_tampering_is_detected(self):
  with tempfile.TemporaryDirectory() as d:
   package,photos,_=self.fixture(Path(d));(package/'normals.npy').write_bytes(b'changed');_,result=audit(package,photos);self.assertEqual(result['status'],'integrity-failed');self.assertTrue(any('hash mismatch' in x for x in result['issues']))
 def test_nonfinite_or_wrong_shape_not_hidden_by_updated_hash(self):
  for a in [np.full((3,6,8),np.nan,dtype=np.float32),np.zeros((6,8,3),dtype=np.float32)]:
   with tempfile.TemporaryDirectory() as d:
    package,photos,m=self.fixture(Path(d));np.save(package/'normals.npy',a);m['images'][0]['outputs']['normals']['npy_sha256']=sha(package/'normals.npy');(package/'manifest.json').write_text(json.dumps(m));self.assertEqual(audit(package,photos)[1]['status'],'integrity-failed')
 def test_patch_and_rotation_conventions(self):
  a=np.zeros((3,6,8));a[1]=2;s=patch(a,[0,0,8,6]);self.assertEqual(s['p90DeviationDeg'],0);self.assertEqual(s['normal'],[0,1,0]);self.assertAlmostEqual(angle([0,1,0],[0,-1,0]),180)
  np.testing.assert_allclose(camera_normal([0,0,-1],[0,0,0,0,0,0,60,0]),[0,0,1]);np.testing.assert_allclose(camera_normal([0,0,1],[0,0,0,np.pi,0,0,60,0]),[0,0,1],atol=1e-10)
  with self.assertRaises(ValueError):patch(a,[0,0,9,6])
  with self.assertRaises(ValueError):patch(np.zeros_like(a),[0,0,8,6])
 def test_paths_cannot_escape_package(self):
  with self.assertRaises(ValueError):inside(Path('/tmp/package'),'../secret')
if __name__=='__main__':unittest.main()
