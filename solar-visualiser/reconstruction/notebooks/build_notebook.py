"""Generate the portable notebook; its helper cell is tested against marigold_batch.py."""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).resolve().parent
cells=[]
def cell(kind,source,hidden=False):
 source=source.strip()+'\n'
 c={'cell_type':kind,'id':hashlib.sha256((str(len(cells))+source).encode()).hexdigest()[:12],'metadata':{},'source':source.splitlines(True)}
 if kind=='code':c.update(execution_count=None,outputs=[])
 if hidden:c['metadata']={'jupyter':{'source_hidden':True}}
 cells.append(c)
cell('markdown','''# Marigold V2 — photo folder to reconstruction evidence

Run depth, normals, albedo and see-through depth over selected photos. Export the
**raw float32 `.npy` arrays**, lossless PNG previews, prepared/original photos,
source mappings, transforms, model fingerprints and settings in one ZIP.

This notebook is self-contained: uploading this `.ipynb` is enough. It uses the
pinned official Marigold CLI; it does not need the house-reconstruction repository.
GPU inference requires a **Linux NVIDIA/CUDA machine**. The upstream estimate is
about 17 GB VRAM at 1024²; a 24 GB+ GPU is a practical starting point. The Mac can
inspect the notebook/results but cannot run this CUDA inference. No paid GPU is
provisioned and nothing is uploaded by the notebook.

**Environment:** preferably use the upstream Python 3.10 conda environment. On a
fresh GPU machine, prepare it in a terminal, then select its Jupyter kernel:

```bash
git clone https://github.com/huawei-bayerlab/marigold-v2.git ~/marigold-v2
cd ~/marigold-v2
git checkout cc6a7031abcd59fd9e1ceff7fdd0d9687d389bc5
bash setup/setup_env.sh marigold-v2 cu128
conda activate marigold-v2
python -m pip install jupyterlab ipykernel
python -m ipykernel install --user --name marigold-v2 --display-name "Marigold V2"
jupyter lab
```

Alternatively, the optional install cell below installs into a compatible existing
Linux GPU notebook kernel. Restart that kernel after installing. Copy/mount your
photo directory onto that GPU machine first (for example a mounted Drive folder).

[Upstream instructions](https://github.com/huawei-bayerlab/marigold-v2#quick-start)
· [CLI source](https://github.com/huawei-bayerlab/marigold-v2/blob/cc6a7031abcd59fd9e1ceff7fdd0d9687d389bc5/scripts/infer.py)
''')
cell('markdown','''## 1. Configuration

Change `PHOTO_DIR` and `OUTPUT_DIR`. Keep the two directories separate. Put a
persistent output directory on a mounted disk if your GPU session is temporary.
A completed result is reused only when its file hashes and array checks pass.
Changing inputs, settings, model assets or environment requires a new output folder.
''')
cell('code','''from pathlib import Path

PHOTO_DIR = Path("/path/to/photos")
OUTPUT_DIR = Path("/path/to/marigold-results/broom-road-run-01")
PROPERTY_ID = "3broomroad"
REPO_DIR = Path.home() / "marigold-v2"
ASSETS_DIR = REPO_DIR / "assets"
MODALITIES = ["depth", "normals", "albedo", "depth_seethrough"]
MAX_EDGE = 1024  # Preserve aspect ratio; do not upscale. Lower if VRAM is tight.
SEED = 2025
INSTALL_DEPENDENCIES = False  # Enable only for a fresh Linux GPU kernel, then restart.
DOWNLOAD_MODELS = True       # Only selected inference weights; resumes existing downloads.
DISK_RESERVE_GIB = 8          # Working headroom, in addition to missing model bytes.
REMOVE_UNUSED_ASSETS = False # Opt-in cleanup of unused weights from the old broad downloader.
CLEAN_COMPLETED_ATTEMPTS = True # Keep results/logs/configs; remove redundant CLI image copies.
INCLUDE_ORIGINALS_IN_ZIP = True

# By default skip previous prediction previews and obvious plans/aerials.
# Review the inventory below; names cannot reliably classify photo content.
EXCLUDE_PATTERNS = ["*_depth*", "*_normal*", "*_albedo*", "*seethrough*",
                    "*floorplan*", "*floor_plan*", "aerial.*"]
EXCLUDE_RELATIVE_PATHS = []   # Exact paths shown in the inventory, e.g. "misc/map.jpg".
ONLY_RELATIVE_PATHS = []      # Empty = all eligible photos, including interiors.
''')
cell('markdown','''## 2. Pinned code and optional kernel setup

A new checkout is pinned automatically. An existing checkout is never reset.
The optional installation uses the upstream Torch versions and project dependencies;
it must run in an isolated GPU notebook environment, not your application environment.
''')
cell('code','''import os, platform, subprocess, sys
PINNED_COMMIT = "cc6a7031abcd59fd9e1ceff7fdd0d9687d389bc5"
REPO_DIR, ASSETS_DIR = REPO_DIR.expanduser().resolve(), ASSETS_DIR.expanduser().resolve()
if not REPO_DIR.exists():
    subprocess.run(["git", "clone", "https://github.com/huawei-bayerlab/marigold-v2.git", str(REPO_DIR)], check=True)
    subprocess.run(["git", "-C", str(REPO_DIR), "checkout", "--detach", PINNED_COMMIT], check=True)
head = subprocess.check_output(["git", "-C", str(REPO_DIR), "rev-parse", "HEAD"], text=True).strip()
if head != PINNED_COMMIT:
    raise RuntimeError("Existing checkout differs. Set REPO_DIR to a new folder for the pinned version.")
if INSTALL_DEPENDENCIES:
    if platform.system() != "Linux":
        raise RuntimeError("Use a Linux CUDA GPU kernel for dependency installation.")
    subprocess.run([sys.executable, "-m", "pip", "install", "--no-cache-dir", "torch==2.10.0", "torchvision==0.25.0",
                    "--index-url", "https://download.pytorch.org/whl/cu128"], check=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "--no-cache-dir", "-e", str(REPO_DIR)], check=True)
    subprocess.run([sys.executable, "-m", "pip", "check"], check=True)
    raise RuntimeError("Installation complete. Restart the kernel, set INSTALL_DEPENDENCIES=False, then run again.")
print("Upstream revision:", head)
''')
cell('markdown','''## 3. Folder-processing helpers

This cell is embedded so the notebook can travel by itself. The matching
`marigold_batch.py` in this repository is the tested source. Resume is per
photo/modality; each remaining modality batch loads its model once. An interrupted
batch salvages valid outputs; rerunning processes missing or damaged results.
''')
helper=(HERE/'marigold_batch.py').read_text()
cell('code',"HELPER_SHA256 = "+repr(hashlib.sha256(helper.encode()).hexdigest())+'\n'+helper,True)
cell('markdown','''## 4. Review the input inventory

Previous depth/normal/albedo previews are excluded by name. Unreadable or animated
images are reported. Exact decoded-pixel duplicates are processed once with every
source alias retained. EXIF orientation is applied; alpha is dropped on RGB
conversion. Original bytes are not modified. TIFFs are converted to a single PNG.
''')
cell('code','''from IPython.display import display, HTML, Image as DisplayImage, FileLink
import html

sources, skipped = discover(PHOTO_DIR, EXCLUDE_PATTERNS)
known = {s["source"] for s in sources}
unknown = (set(ONLY_RELATIVE_PATHS) | set(EXCLUDE_RELATIVE_PATHS)) - known
if unknown:
    raise ValueError("Selection contains unknown or already excluded paths: " + repr(sorted(unknown)))
selected = [s for s in sources if s["source"] not in EXCLUDE_RELATIVE_PATHS
            and (not ONLY_RELATIVE_PATHS or s["source"] in ONLY_RELATIVE_PATHS)]
skipped += [{"source": s["source"], "reason": "explicit selection"} for s in sources if s not in selected]
print(f"{len(selected)} selected files; {len(skipped)} excluded/unreadable.")
for i, source in enumerate(selected):
    print(f"{i:3d}  {source['source']}  {source['oriented_size']}  EXIF={source['exif_orientation']}")
for source in skipped:
    print("SKIP:", source["source"], "—", source["reason"])
if not selected:
    raise ValueError("No photos selected. Check PHOTO_DIR and filters.")
''')
cell('code','''manifest = prepare(PHOTO_DIR, OUTPUT_DIR, selected, skipped, MODALITIES, MAX_EDGE, SEED, PROPERTY_ID)
OUTPUT_DIR = OUTPUT_DIR.expanduser().resolve()
print(f"Prepared {len(manifest['images'])} unique photos in {OUTPUT_DIR}")
for row in manifest["images"][:8]:
    print(row["source"], "→", row["input_size"], "aliases:", [a["source"] for a in row["aliases"]])
    display(DisplayImage(filename=str(OUTPUT_DIR / row["input"]), width=260))
''')
cell('markdown','''## 5. GPU and assets

This check happens before model downloads. Confirm your GPU has enough **free**
VRAM. Models download from Hugging Face; your photos stay on the machine running
this kernel. This notebook downloads only the Qwen transformer/VAE, the chosen
Marigold checkpoints and their precomputed prompt embeddings. All four outputs
currently need about **48.6 GB of weight files**, versus about 75 GB for the broad
upstream downloader, before dependencies, photos, results and caches. Disk and
GPU VRAM are separate limits. The free-space check reads model metadata first;
partial files are conservatively counted as full remaining downloads.

**Recovering from a full disk during the old download:** the next cell first lists
unused model assets and their sizes. It leaves them alone by default. For this
notebook's dedicated asset directory, stop other jobs and set
`REMOVE_UNUSED_ASSETS=True` to remove those listed weights/partial transfers.
Photos, predictions and required weights are kept. Do not use this option if
another workflow needs those components or a prior completed run's asset lock
includes them. You can also run `!python -m pip cache purge` to clear downloaded
package archives (installed packages remain). Avoid deleting the whole Hugging
Face cache or restarting the Colab runtime: you may lose reusable downloads.

A failure before inference can reuse its prepared OUTPUT_DIR. After inference has
recorded code/assets/environment, changes require a new output directory. The new
selective downloader reuses existing required weights. For persistent storage,
set ASSETS_DIR to a mounted disk **before** downloading; changing it does not move
existing weights. The reserve is a headroom estimate, not a guarantee for any
number of photos. Weight fingerprints are read once on first run and verified on
resume, which can take a few minutes.

[Reviewed model loader](https://github.com/huawei-bayerlab/marigold-v2/blob/cc6a7031abcd59fd9e1ceff7fdd0d9687d389bc5/marigoldv2/experiments/20260316_qwen_depth/component_loader.py)
loads the transformer and VAE; the network uses precomputed prompt embeddings.
''')
cell('code','''unused = prune_unused_assets(ASSETS_DIR, MODALITIES, dry_run=True)
for item in unused:
    print(f"Unused: {item['bytes']/2**30:.2f} GiB  {item['path']}")
print(f"Reclaimable listed assets: {sum(i['bytes'] for i in unused)/2**30:.2f} GiB")
if REMOVE_UNUSED_ASSETS:
    prune_unused_assets(ASSETS_DIR, MODALITIES, dry_run=False)
    print("Removed listed unused assets. Required weights and photos kept.")

import torch
if platform.system() != "Linux" or not torch.cuda.is_available():
    raise RuntimeError("Inference requires a Linux NVIDIA CUDA kernel; preparation can run without it.")
free, total = torch.cuda.mem_get_info()
print(torch.cuda.get_device_name(0), f"free={free/1e9:.1f} GB, total={total/1e9:.1f} GB")
if free < 17e9:
    print("VRAM below upstream's approximate 1024-square requirement. Consider a larger GPU or reduce MAX_EDGE in a new run.")
check_inference_imports(REPO_DIR)
if DOWNLOAD_MODELS:
    download_plan = download_inference_assets(ASSETS_DIR, MODALITIES, reserve_gib=DISK_RESERVE_GIB)
    write_json(OUTPUT_DIR / "download-plan.json", download_plan)
provenance = runtime_provenance(REPO_DIR, ASSETS_DIR, MODALITIES, OUTPUT_DIR)
print("Model/code/environment provenance recorded.")
''')
cell('markdown','''## 6. Run all selected predictions

The CLI runs at its native-input setting on the prepared, aspect-preserving PNGs.
This avoids fixed-width/height output resizing surprises. Raw arrays align with
`inputs/<id>.png`; the manifest records their relationship to the originals.

The upstream CLI already processes one photo at a time, loading the model once
per modality. Smaller photo groups do not shrink the shared model weights. Staged
inputs use hard links where supported. After a successful modality pass, validated
results are retained and redundant CLI images are removed; logs/configs remain.
Failed attempts remain available for diagnosis.
The notebook prints the last 80 log lines for a failed pass and stops if that
pass yields no validated predictions. Missing NPY files are a consequence;
use the underlying exception in the log to diagnose the failure.

Logs are in each printed attempt folder. Interrupting the cell terminates the
inference process group. Rerun to resume. Partial jobs cannot be exported as a
complete evidence ZIP. Array validation checks file integrity, not geometric accuracy.
''')
cell('code','''manifest = run_batch(REPO_DIR, ASSETS_DIR, OUTPUT_DIR, provenance,
                     clean_completed_attempts=CLEAN_COMPLETED_ATTEMPTS)
print("Run status:", manifest["status"])
for row in manifest["images"]:
    print(row["source"], "→", list(row["outputs"]), row.get("last_error", ""))
if manifest["status"] != "complete":
    print("Read the attempt logs, resolve the failure (e.g. CUDA memory), and rerun this cell.")
''')
cell('markdown','''## 7. Inspect arrays and compare previews

Depth values use the selected checkpoint's relative **log-depth** representation,
not metres. Normals use camera coordinates; preserve the raw CHW array and validate
axis conventions before world-space use. Albedo from this pinned CLI is gamma-2.2
converted sRGB. See-through depth is a distinct prediction of surfaces behind glass.

PNG previews are for inspection; never reconstruct raw values from their colours.
''')
cell('code','''manifest = json.loads((OUTPUT_DIR / "manifest.json").read_text())
PHOTO_INDEX = 0  # Change to inspect another photo.
row = manifest["images"][PHOTO_INDEX]
print(row["source"], "ID:", row["id"])
display(DisplayImage(filename=str(OUTPUT_DIR / row["input"]), width=420))
for modality in MODALITIES:
    record = row["outputs"].get(modality)
    if not record:
        print(modality, "MISSING")
        continue
    array = np.load(OUTPUT_DIR / record["npy"], allow_pickle=False)
    print(modality, array.shape, array.dtype, record["encoding"], record["stats"])
    display(DisplayImage(filename=str(OUTPUT_DIR / record["png"]), width=420))
''')
cell('markdown','''## 8. Export a reconstruction evidence ZIP

Bring this ZIP back to the reconstruction workspace. It contains originals
(optional), prepared RGBs, raw NPYs, PNG previews, source/alias mappings, input
transforms, checkpoint metadata, runtime versions, hashes, inference logs/configs.
No metric scale or geometry acceptance is implied. ZIP64 supports large batches.

```
manifest.json
asset-lock.json
originals/<source-relative filename>
inputs/<stable image ID>.png
results/<stable image ID>/depth.npy + depth.png
results/<stable image ID>/normals.npy + normals.png
results/<stable image ID>/albedo.npy + albedo.png
results/<stable image ID>/depth_seethrough.npy + depth_seethrough.png
attempts/.../inference.log and config.yaml
```
''')
cell('code','''archive = export_zip(OUTPUT_DIR, include_originals=INCLUDE_ORIGINALS_IN_ZIP)
print("Evidence archive:", archive)
print(f"Size: {archive.stat().st_size / 1e6:.1f} MB")
# A FileLink works when the archive is inside the Jupyter server's served folder.
# Otherwise use the server file browser / mounted disk to retrieve the printed path.
display(FileLink(str(archive)))
# Optional in Colab: from google.colab import files; files.download(str(archive))
''')
nb={'cells':cells,'metadata':{'kernelspec':{'display_name':'Python 3 (Marigold V2)','language':'python','name':'python3'},'language_info':{'name':'python','version':'3.10'},'marigold_helper_sha256':hashlib.sha256(helper.encode()).hexdigest()},'nbformat':4,'nbformat_minor':5}
(HERE/'marigold-folder.ipynb').write_text(json.dumps(nb,indent=1)+'\n')
print('Generated',len(cells),'cells')
