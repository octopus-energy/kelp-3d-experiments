#!/usr/bin/env python3
"""Evidence intake must stay honest with incomplete or differently named datasets."""
import json,tempfile,unittest
from pathlib import Path
from prepare_evidence import build

class EvidenceTests(unittest.TestCase):
 def test_empty_dataset_does_not_inherit_broom_geometry(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)/'another-house';root.mkdir();report=build(root)
   self.assertEqual(report['propertyId'],'another-house');self.assertIsNone(report['case']);self.assertIsNone(report['os']);self.assertIsNone(report['modelRevision'])
   self.assertEqual(report['readiness'],'needs-interpretation');self.assertEqual(set(report['missingEvidence']),{'os','dsm','plan','image-index'})
 def test_unclassified_sources_and_repeatability(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'new-plan.pdf').write_bytes(b'fixture');a=build(root);self.assertEqual(a,build(root));self.assertEqual(a['sources'][0]['status'],'needs-classification')
   (root/'new-plan.pdf').write_bytes(b'changed');self.assertNotEqual(a['revision'],build(root)['revision'])
 def test_candidate_change_invalidates_revision(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);out=root/'reconstruction';out.mkdir();(out/'candidate.json').write_text('{}');a=build(root);(out/'candidate.json').write_text('{"roof":"changed"}');self.assertNotEqual(a['revision'],build(root)['revision'])
 def test_manifest_path_cannot_escape_dataset(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'image-manifest.json').write_text(json.dumps({'images':[{'id':'bad','file':'../outside.jpeg'}]}))
   with self.assertRaisesRegex(ValueError,'escapes'):build(root)
 def test_missing_photo_stays_missing(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);(root/'image-manifest.json').write_text(json.dumps({'images':[{'id':'missing','file':'missing.jpeg'}]}));photo=build(root)['sources'][1]
   self.assertIsNone(photo['sha256']);self.assertEqual(photo['status'],'missing')
 def test_prediction_previews_are_not_independent_photos(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);package=root/'raw-batch';package.mkdir()
   (package/'manifest.json').write_text(json.dumps({'kind':'monocular-prediction-evidence'}))
   (package/'normals.png').write_bytes(b'preview');(root/'source.jpg').write_bytes(b'photo')
   sources=build(root)['sources'];self.assertEqual(len(sources),2)
   self.assertEqual(sum(s['kind']=='monocular-predictions' for s in sources),1)
if __name__=='__main__':unittest.main()
