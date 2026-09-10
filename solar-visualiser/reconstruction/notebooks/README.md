# Marigold folder notebook

Open **marigold-folder.ipynb** in Jupyter on a Linux CUDA GPU machine. The notebook
is self-contained and can be uploaded by itself. Choose the upstream Python 3.10
kernel, edit `PHOTO_DIR` / `OUTPUT_DIR`, review the inventory, then run the cells.
Environment setup instructions and optional install/download cells are included.
A Mac can prepare/inspect files; GPU inference requires the documented CUDA setup.

## Disk space and recovering the original download

The original notebook used upstream `download_assets.py --skip-datasets`, which
still downloads the complete Qwen repository and all Marigold depth variants.
The user reported disk usage of 108.2/112.6 GB and a failure in this download cell,
before any inference. The error excerpt alone does not confirm ENOSPC, but this
exposed unnecessary downloads and a missing disk preflight.

The updated notebook selects Qwen transformer/VAE, the selected task adapters and
their exact prompt embeddings. It pins both model repository revisions, checks
remote file sizes against free disk with an 8 GiB configurable reserve, and uses
one download worker. With all four modalities, the reviewed metadata totals about
48.6 GB of selected assets versus roughly 75 GB for the full repositories. Allow
additional space for the Python environment, caches, sources, results and ZIP.
This is disk usage, not GPU VRAM. Partial transfers count conservatively as full
missing files; the downloader itself resumes available chunks.

For an existing Colab session, keep that session and its required weights. Copy
the updated helper cell (section 3) and GPU/assets cell (section 5) into the old
notebook. Define `DISK_RESERVE_GIB = 8` and `REMOVE_UNUSED_ASSETS = False` first.
Section 5 lists disposable assets; set `REMOVE_UNUSED_ASSETS = True` and rerun it
to remove those components and their local partial-download caches. This option
is only for this notebook's dedicated inference assets with no other jobs running.
It can invalidate older full asset locks. A failed pre-inference run can reuse its
prepared output folder; an already-recorded inference environment needs a new one.
`!python -m pip cache purge` can reclaim package download archives without removing
installed packages. Do not indiscriminately delete all Hugging Face caches.

The inference CLI already evaluates one photo at a time. Smaller photo batches
do not shrink the shared weights. The helper now hard-links staged inputs where
supported and removes duplicate CLI image/array files after each successful,
validated modality pass; results, original photos, logs and YAML configs remain.
Failed attempts are retained for diagnosis. Set `CLEAN_COMPLETED_ATTEMPTS = False`
to retain successful temporary outputs too. The optional installer no longer
caches pip archives. For another disk, set ASSETS_DIR before downloading; this
does not relocate already-downloaded weights automatically.

## Missing dependencies in step 6

The observed `ModuleNotFoundError: No module named 'bitsandbytes'` happens during
imports, before inference. In Colab install the upstream requirement with
`%pip install --no-cache-dir bitsandbytes==0.49.2`. Keep the existing model assets;
set a new OUTPUT_DIR and DOWNLOAD_MODELS=False, then rerun sections 4, 5 and 6
to prepare inputs and record the repaired environment. This addresses that import
error; any further dependency/CUDA error still needs diagnosis.

Section 5 now imports the inference modules in the CLI's Python interpreter
before downloads. Failed inference passes show their last 80 log lines directly;
a pass yielding zero validated outputs stops subsequent modalities. The import
preflight does not load model weights or establish GPU inference success.

If loading reaches the first image and fails with `unexpected keyword argument
'txt_seq_lens'`, the loaded Diffusers API is incompatible with Marigold's call.
Install the required `diffusers==0.38.0` and verify its forward signature in a
fresh subprocess before retrying with refreshed provenance in a new output folder.
Section 5 now checks both this version pin and argument compatibility before
downloads, without allocating model weights. Required model assets can be reused.

By default every selected photo receives four float32 NPY files and four PNG
previews: ordinary log depth, normals, albedo and separate see-through log depth.
The final ZIP includes source/alias mapping, originals (optional), oriented/resized
inputs, output hashes, model asset fingerprints, logs/configs and runtime versions.

The batch preparation preserves aspect ratio and limits the long edge to 1024,
then calls upstream native-input inference. The raw arrays align to the prepared
RGBs, not necessarily to original dimensions. The manifest records EXIF orientation,
original/oriented/prepared sizes and exact scale factors. The pinned CLI exports
albedo with its sRGB gamma conversion; metadata records that rather than assuming
the array is linear RGB. Normals are left unmodified; resized vectors may need
renormalization downstream. Depth is not a metric DSM.

Generated previews and obvious plans/aerials are excluded by editable filename
patterns. Review the listing before running; this is not semantic photo selection.
Decoded-pixel duplicate aliases are retained, and content IDs prevent same-stem
collisions. Inputs and model/environment revisions cannot silently mix in one run.
Valid outputs survive interrupted/failed batches; rerunning processes missing or
corrupt image/modality pairs. Check logs when a run remains partial. Final export
requires all selected predictions to pass integrity/shape checks, which do not
certify geometric accuracy.

## Maintenance and tests

`marigold_batch.py` is the CPU-testable helper implementation embedded in the
notebook. After changing it, regenerate the notebook:

```sh
python3 solar-visualiser/reconstruction/notebooks/build_notebook.py
python3 solar-visualiser/reconstruction/notebooks/test_marigold_batch.py
```

The tests use fake prediction files: selection, duplicate aliases, orientation,
shape/dtype/finite checks, partial failure, resume, stale-output detection, archive
contents, selective asset metadata/space preflight, opt-in cleanup scope,
temporary image cleanup and embedded cell compilation/parity. A real Broom Road preparation check
selected 24 files, deduplicated them to 22 photos and excluded all seven previous
Marigold previews. **Actual model inference has not been tested on this Mac.**

The notebook pins upstream code to `cc6a7031abcd59fd9e1ceff7fdd0d9687d389bc5`.
[Upstream inference source](https://github.com/huawei-bayerlab/marigold-v2/blob/cc6a7031abcd59fd9e1ceff7fdd0d9687d389bc5/scripts/infer.py)
and [output adapters](https://github.com/huawei-bayerlab/marigold-v2/blob/cc6a7031abcd59fd9e1ceff7fdd0d9687d389bc5/marigoldv2/validation/folder_steps.py)
were checked on 2026-09-10. Keep model outputs as proposed evidence; do not
automatically apply them to the building model or treat correlated predictions
as independent verification.
