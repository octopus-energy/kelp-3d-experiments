#!/usr/bin/env python3
"""Package the reviewed image subset for a CUDA Marigold V2 machine.
Does not download weights, send images, or execute inference.
Usage: python prepare_depth_job.py /path/to/job
"""
import json,shutil,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'3broomroad-data'
IDS=['4319b0211a370eba9015b36e035cc7a1','655c2e755834a41b23f260899a2fe835','88a6310f77aee7b99e0c2e18136d4b78','bd31bdb708cc878cc82d2d19ad072c68','b3c87cfb9faa2d98b3231da431fae97b','d234ecc31aca67d6789df113f1b380c8','665a47dfe68e005497291515decd24d8','e5ccf137f38f3fea774a3f2d86ba7e07']
def main():
 if len(sys.argv)!=2:raise SystemExit(__doc__)
 out=Path(sys.argv[1]).resolve();(out/'images').mkdir(parents=True,exist_ok=True)
 for id in IDS:shutil.copyfile(DATA/'photos'/f'{id}.jpeg',out/'images'/f'{id}.jpeg')
 manifest={'schemaVersion':1,'propertyId':'3broomroad','status':'prepared-not-run','model':'huawei-bayerlab/marigold-v2','source':'https://github.com/huawei-bayerlab/marigold-v2','images':IDS,'modalities':['depth','normals'],'checkpoint':'depth/Log-stage2','depthSpace':'affine-invariant log depth','seed':2025,'requirements':'Documented Linux/CUDA setup; approx 17 GB VRAM at 1024x1024.','integration':'Preserve raw predictions. Default depth is not metric; fit positive scale and shift in LOG depth using independent metric anchors before any metric comparison. Camera normals require the camera-to-world transform. Predictions remain evidence proposals, not new measurements.'}
 (out/'job.json').write_text(json.dumps(manifest,indent=2)+'\n')
 (out/'README.md').write_text('''# Broom Road depth experiment — prepared, not run

This folder contains original listing photos. No depth predictions are included.
On a compatible Linux/CUDA host, install the official Marigold V2 repository
following its README, then run from that repository (replace JOB with this folder):

```sh
python scripts/infer.py --modality depth --image_dir JOB/images --output_dir JOB/depth --seed 2025
python scripts/infer.py --modality normals --image_dir JOB/images --output_dir JOB/normals --seed 2025
```

Keep the `.npy` arrays at original image resolution, together with checkpoint,
commit, seed and image IDs. The default checkpoint returns affine-invariant log
depth. It is NOT a DSM or a metric point cloud. The reconstruction runner does
not consume these predictions yet; alignment, masks and independent validation
must be implemented before including them in fitting. Do not calibrate against
the candidate and then claim that agreement independently validates the model.
''')
 print(out)
if __name__=='__main__':main()
