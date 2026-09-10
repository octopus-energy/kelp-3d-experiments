"""Notebook helpers: prepare sources, run official CLI, validate and export evidence.
Only NumPy/Pillow are needed for preparation and tests. Inference uses a separate
CLI process in the active Marigold environment. No reconstruction state is changed.
"""
from pathlib import Path
from datetime import datetime, timezone
import fnmatch
import hashlib
import json
import os
import shutil
import signal
import subprocess
import sys
import uuid
import zipfile
import numpy as np
from PIL import Image, ImageOps

UPSTREAM_COMMIT = 'cc6a7031abcd59fd9e1ceff7fdd0d9687d389bc5'
TASKS = {
    'depth': {'modality': 'depth', 'checkpoint': 'depth/Log-stage2', 'preview': 'depth_spectral', 'encoding': 'affine-invariant log depth; not metres'},
    'normals': {'modality': 'normals', 'checkpoint': 'normals', 'preview': 'normals', 'encoding': 'camera-space XYZ vectors, CHW; renormalize after interpolation if used downstream'},
    'albedo': {'modality': 'albedo', 'checkpoint': 'albedo', 'preview': 'albedo', 'encoding': 'sRGB via upstream gamma-2.2 conversion, CHW; not linear RGB'},
    'depth_seethrough': {'modality': 'depth', 'checkpoint': 'depth/Log-layered', 'preview': 'depth_spectral', 'encoding': 'see-through affine-invariant log depth; separate from exterior surface depth'},
}
DEFAULT_EXCLUDES = ['*_depth*', '*_normal*', '*_albedo*', '*seethrough*', '*floorplan*', '*floor_plan*', 'aerial.*']

# File selections verified against the pinned inference config/loader, which load
# only VAE + transformer and precomputed prompt embeddings (no text encoder).
MODEL_REVISIONS = {
    'Qwen/Qwen-Image-Edit-2509': 'd3968ef930e841f4c73640fb8afa3b306a78167e',
    'huawei-bayerlab/marigold-v2-0': '6fd6d1ca246c9d2d99a4d8ac375a4eccc87178ad',
}
EMBED_PREFIXES = {'depth': 'qwen_edit_2509_qwen_depth_realimg512',
                  'normals': 'qwen_edit_2509_qwen_normals_dummy512',
                  'albedo': 'qwen_edit_2509_qwen_albedo_rgb_dummy512'}


def asset_specs(modalities):
    if not modalities or any(m not in TASKS for m in modalities):
        raise ValueError('Select supported modalities before downloading assets.')
    patterns = [TASKS[m]['checkpoint'] + '/*' for m in modalities]
    patterns += ['qwen_text_embeddings/' + EMBED_PREFIXES[m] + suffix
                 for m in sorted({TASKS[m]['modality'] for m in modalities})
                 for suffix in ['_prompt_embeds.pt', '_prompt_mask.pt']]
    return [dict(repo_id=repo, revision=MODEL_REVISIONS[repo], directory=directory, patterns=pats)
            for repo, directory, pats in [
                ('Qwen/Qwen-Image-Edit-2509', 'Qwen-Image-Edit-2509', ['transformer/*', 'vae/*']),
                ('huawei-bayerlab/marigold-v2-0', 'Marigold-V2', patterns)]]


def plan_assets(assets, modalities, api=None):
    """Read metadata only; estimate missing bytes conservatively, including partial files."""
    if api is None:
        from huggingface_hub import HfApi
        api = HfApi()
    assets = Path(assets).resolve()
    specs = asset_specs(modalities)
    for spec in specs:
        info = api.model_info(spec['repo_id'], revision=spec['revision'], files_metadata=True)
        files = []
        for entry in info.siblings:
            name = entry.rfilename
            if not any(fnmatch.fnmatch(name, p) for p in spec['patterns']):
                continue
            if Path(name).is_absolute() or '..' in Path(name).parts or entry.size is None:
                raise ValueError('Invalid or missing remote file metadata: ' + name)
            target = assets/'checkpoints'/spec['directory']/name
            files.append({'name': name, 'size': entry.size,
                          'missing_bytes': 0 if target.is_file() and target.stat().st_size == entry.size else entry.size})
        if any(not any(fnmatch.fnmatch(f['name'], p) for f in files) for p in spec['patterns']):
            raise ValueError('Required model files absent from pinned metadata: ' + spec['repo_id'])
        spec['files'] = files
    return specs


def download_inference_assets(assets, modalities, reserve_gib=8, api=None, download=None):
    """Download only inference assets, directly to local_dir, after a disk preflight."""
    if reserve_gib < 0:
        raise ValueError('Disk reserve must be nonnegative.')
    assets = Path(assets).resolve()
    assets.mkdir(parents=True, exist_ok=True)
    specs = plan_assets(assets, modalities, api)
    required = sum(f['missing_bytes'] for s in specs for f in s['files'])
    free = shutil.disk_usage(assets).free
    reserve = int(reserve_gib * 2**30)
    print(f'Assets disk: {free/2**30:.1f} GiB free; up to {required/2**30:.1f} GiB to download; '
          f'{reserve_gib:g} GiB working reserve.', flush=True)
    if required + reserve > free:
        raise OSError('Insufficient disk for selected weights plus working reserve. '
                      'Review unused assets/package cache or choose a larger ASSETS_DIR disk. '
                      'Reducing the photo batch does not reduce model storage. No weights downloaded.')
    if download is None:
        from huggingface_hub import snapshot_download
        download = snapshot_download
    for spec in specs:
        print('Downloading/resuming:', spec['repo_id'], flush=True)
        download(repo_id=spec['repo_id'], revision=spec['revision'],
                 local_dir=str(assets/'checkpoints'/spec['directory']),
                 allow_patterns=[f['name'] for f in spec['files']], max_workers=1)
    return specs


def prune_unused_assets(assets, modalities, dry_run=True):
    """Opt-in recovery for a dedicated inference asset directory; never touch sources/results.

    Stop all jobs using this directory first. Pruning may invalidate earlier full
    asset locks: retain those assets if another run depends on them.
    """
    assets = Path(assets).resolve()
    specs = asset_specs(modalities)
    qwen = assets/'checkpoints'/'Qwen-Image-Edit-2509'
    marigold = assets/'checkpoints'/'Marigold-V2'
    candidates = [qwen/name for name in ['text_encoder', 'tokenizer', 'processor', 'scheduler']]
    selected = {TASKS[m]['checkpoint'] for m in modalities}
    candidates += [marigold/name for name in ['depth/Disparity-base', 'depth/Disparity-layered',
                   'depth/Log-stage1', 'depth/Log-stage2', 'depth/Log-layered',
                   'depth/Uniform-base', 'depth/Uniform-layered', 'normals', 'albedo'] if name not in selected]
    # local_dir keeps interrupted transfers under .cache/huggingface/download.
    # Remove only caches for the explicitly unused component directories above.
    candidates += [root/'.cache'/'huggingface'/'download'/p.relative_to(root)
                   for p in list(candidates) for root in [qwen, marigold] if p.is_relative_to(root)]
    for path in (marigold/'qwen_text_embeddings').glob('*.pt'):
        if not any(fnmatch.fnmatch(path.relative_to(marigold).as_posix(), p) for p in specs[1]['patterns']):
            candidates.append(path)
    report = []
    for path in candidates:
        # Do not follow links into other model stores or mount points.
        if not path.exists() or path.is_symlink() or not path.resolve().is_relative_to(assets):
            continue
        size = sum(p.stat().st_size for p in path.rglob('*') if p.is_file() and not p.is_symlink()) if path.is_dir() else path.stat().st_size
        report.append({'path': str(path), 'bytes': size})
        if not dry_run:
            shutil.rmtree(path) if path.is_dir() else path.unlink()
    return report


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temp.replace(path)


def discover(photo_dir, excludes=DEFAULT_EXCLUDES):
    root = Path(photo_dir).expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f'Photo folder does not exist: {root}')
    found, skipped = [], []
    for path in sorted(root.rglob('*')):
        if not path.is_file() or path.suffix.lower() not in {'.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'}:
            continue
        rel = path.relative_to(root).as_posix()
        if not path.resolve().is_relative_to(root):
            raise ValueError(f'Source symlink escapes photo folder: {rel}')
        if any(part.startswith('.') for part in Path(rel).parts) or any(fnmatch.fnmatch(rel.lower(), p.lower()) or fnmatch.fnmatch(path.name.lower(), p.lower()) for p in excludes):
            skipped.append({'source': rel, 'reason': 'excluded by filename pattern'})
            continue
        try:
            with Image.open(path) as im:
                if getattr(im, 'n_frames', 1) != 1:
                    raise ValueError('Multi-frame image: supply one photo per file')
                original_size, orientation = list(im.size), int(im.getexif().get(274, 1))
                rgb = ImageOps.exif_transpose(im).convert('RGB')
                pixel_hash = hashlib.sha256(str(rgb.size).encode() + rgb.tobytes()).hexdigest()
            found.append({'source': rel, 'source_sha256': sha256(path), 'original_size': original_size, 'exif_orientation': orientation, 'oriented_size': list(rgb.size), 'pixel_sha256': pixel_hash})
        except Exception as exc:
            skipped.append({'source': rel, 'reason': 'unreadable: ' + str(exc)})
    return found, skipped


def prepare(photo_dir, output_dir, selected, skipped, modalities, max_edge=1024, seed=2025, property_id='property'):
    root, out = Path(photo_dir).expanduser().resolve(), Path(output_dir).expanduser().resolve()
    if out == root or out.is_relative_to(root) or root.is_relative_to(out):
        raise ValueError('Keep photo and output folders separate, with neither inside the other.')
    if len({s['source'] for s in selected}) != len(selected):
        raise ValueError('Source selection contains duplicate paths.')
    if not selected or not modalities or len(set(modalities)) != len(modalities) or any(m not in TASKS for m in modalities):
        raise ValueError('Select photos and unique, supported modalities.')
    if not isinstance(max_edge, int) or max_edge < 64:
        raise ValueError('MAX_EDGE must be an integer of at least 64 pixels.')
    config = {'property_id': property_id, 'modalities': list(modalities), 'max_edge': max_edge, 'seed': int(seed), 'source_root': str(root), 'sources': selected}
    fingerprint = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
    manifest_path = out / 'manifest.json'
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if manifest.get('input_fingerprint') != fingerprint:
            raise ValueError('Inputs/settings changed. Choose a new OUTPUT_DIR to preserve the earlier run.')
        for row in manifest['images']:
            if sha256(out / row['input']) != row['input_sha256'] or sha256(root / row['source']) != row['source_sha256']:
                raise ValueError('Prepared input or original source changed; choose a new run folder.')
        return manifest
    if out.exists() and any(out.iterdir()):
        raise ValueError('OUTPUT_DIR is not empty and has no manifest. Choose a new directory.')
    out.mkdir(parents=True, exist_ok=True)
    manifest = {'schemaVersion': 1, 'kind': 'monocular-prediction-evidence', 'status': 'prepared', 'input_fingerprint': fingerprint, 'settings': config, 'created_at': datetime.now(timezone.utc).isoformat(), 'images': [], 'skipped': skipped, 'tasks': TASKS, 'attempts': [], 'environment': None}
    seen = {}
    for source in selected:
        path = (root / source['source']).resolve()
        if not path.is_relative_to(root) or sha256(path) != source['source_sha256']:
            raise ValueError('Source path or content changed during preparation.')
        if source['pixel_sha256'] in seen:
            seen[source['pixel_sha256']]['aliases'].append(dict(source))
            continue
        # Content IDs avoid same-stem collisions and keep duplicate aliases explicit.
        id = source['pixel_sha256'][:24]
        with Image.open(path) as im:
            rgb = ImageOps.exif_transpose(im).convert('RGB')
            rgb.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
            target = out / 'inputs' / (id + '.png')
            target.parent.mkdir(exist_ok=True)
            rgb.save(target)
        row = {**source, 'id': id, 'aliases': [], 'input': target.relative_to(out).as_posix(), 'input_sha256': sha256(target), 'input_size': list(rgb.size), 'transform': {'exif_transposed': True, 'rgb_conversion': True, 'crop': None, 'scale_xy': [rgb.width/source['oriented_size'][0], rgb.height/source['oriented_size'][1]]}, 'outputs': {}}
        manifest['images'].append(row)
        seen[source['pixel_sha256']] = row
    write_json(manifest_path, manifest)
    return manifest


def validate_output(npy, png, modality, size):
    arr = np.load(npy, allow_pickle=False)
    expected = (size[1], size[0]) if TASKS[modality]['modality'] == 'depth' else (3, size[1], size[0])
    if arr.shape != expected or arr.dtype != np.float32 or not np.isfinite(arr).all():
        raise ValueError(f'Invalid array: expected finite float32 {expected}, got {arr.dtype} {arr.shape}')
    with Image.open(png) as im:
        im.load()
        if im.format != 'PNG' or im.size != tuple(size):
            raise ValueError('Preview must be a PNG aligned with its prepared source.')
    stats = {'shape': list(arr.shape), 'dtype': str(arr.dtype), 'minimum': float(arr.min()), 'maximum': float(arr.max()), 'std': float(arr.std()), 'warnings': []}
    if stats['std'] < 1e-7:
        stats['warnings'].append('Nearly constant prediction: inspect visually')
    if modality == 'normals':
        lengths = np.linalg.norm(arr, axis=0)
        stats['median_normal_length'] = float(np.median(lengths))
        stats['zero_normal_fraction'] = float(np.mean(lengths < 1e-6))
        if stats['zero_normal_fraction'] > .01 or np.median(lengths) < .9 or np.median(lengths) > 1.1:
            stats['warnings'].append('Unusual normal magnitudes: inspect raw vectors')
    if modality == 'albedo' and (arr.min() < -.01 or arr.max() > 1.01):
        stats['warnings'].append('Albedo outside expected display range')
    return stats


def output_valid(out, row, modality):
    record = row['outputs'].get(modality)
    if not record:
        return False
    try:
        for key in ['npy', 'png']:
            if sha256(out / record[key]) != record[key + '_sha256']:
                return False
        validate_output(out / record['npy'], out / record['png'], modality, row['input_size'])
        return True
    except (OSError, ValueError):
        return False


QWEN_API_CHECK = '''import inspect
import diffusers
from diffusers import QwenImageTransformer2DModel
if diffusers.__version__ != '0.38.0':
    raise RuntimeError(f"Marigold requires diffusers==0.38.0; found {diffusers.__version__}. "
                       "Install the pinned version in the inference interpreter.")
signature = inspect.signature(QwenImageTransformer2DModel.forward)
signature.bind_partial(self=None, hidden_states=None, timestep=None,
                       encoder_hidden_states=None, encoder_hidden_states_mask=None,
                       img_shapes=None, txt_seq_lens=None, guidance=None,
                       attention_kwargs=None, return_dict=False)
print('Diffusers 0.38.0 Qwen forward API check passed (no weights loaded).')
'''


def check_inference_imports(repo):
    """Test the actual CLI interpreter's imports before downloading/loading weights."""
    script = QWEN_API_CHECK + (
        "import importlib\n"
        "from omegaconf import OmegaConf\n"
        "cfg = OmegaConf.load('evaluation/config/inference_depth.yaml')\n"
        "for name in list(cfg.register_modules) + ['marigoldv2.validation.folder_steps']:\n"
        "    importlib.import_module(name)\n"
        "print('Inference imports passed (model execution not tested).')\n"
    )
    result = subprocess.run([sys.executable, '-c', script], cwd=Path(repo),
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout, flush=True)
    if result.returncode:
        raise RuntimeError('Inference dependency check failed in ' + sys.executable +
                           '. Fix the import error above before downloading weights or running step 6.')


def print_attempt_failure(attempt, record, lines=80):
    print(f"Inference failed: {record['modality']} (exit {record.get('returncode')}). "
          f"{record.get('error', '')}", flush=True)
    log = Path(attempt)/'inference.log'
    if log.exists():
        # Bound memory even when model loaders produce very large logs.
        from collections import deque
        with log.open(errors='replace') as stream:
            print(''.join(deque(stream, maxlen=lines)), flush=True)
    print('Full log:', log, flush=True)


def runtime_provenance(repo, assets, modalities, out):
    repo, assets, out = Path(repo).resolve(), Path(assets).resolve(), Path(out).resolve()
    commit = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
    if commit != UPSTREAM_COMMIT:
        raise ValueError(f'Expected reviewed upstream revision {UPSTREAM_COMMIT}, got {commit}.')
    if subprocess.check_output(['git', '-C', str(repo), 'diff', 'HEAD', '--'], text=True).strip():
        raise ValueError('Upstream tracked files have local modifications; use a clean pinned checkout.')
    # Freeze original asset paths before inference adds any quantisation caches.
    lock = out / 'asset-lock.json'
    existing_lock = lock.exists()
    if existing_lock:
        locked = json.loads(lock.read_text())
    else:
        roots = [assets/'checkpoints'/'Qwen-Image-Edit-2509', assets/'checkpoints'/'Marigold-V2'/'qwen_text_embeddings']
        roots += [assets/'checkpoints'/'Marigold-V2'/TASKS[m]['checkpoint'] for m in modalities]
        paths = sorted({p for r in roots for p in r.rglob('*') if p.is_file() and '.cache' not in p.relative_to(assets).parts})
        if any(not r.is_dir() for r in roots) or not paths:
            raise ValueError('Assets missing. Run the notebook download cell first.')
        locked = {'files': {p.relative_to(assets).as_posix(): sha256(p) for p in paths}}
        write_json(lock, locked)
    for name, digest in (locked['files'].items() if existing_lock else []):
        if sha256(assets / name) != digest:
            raise ValueError(f'Model asset changed: {name}. Use a new run folder.')
    packages = subprocess.check_output([sys.executable, '-m', 'pip', 'freeze'], text=True)
    import torch
    return {'upstream_commit': commit, 'asset_lock_sha256': sha256(lock), 'python': sys.version, 'packages': packages, 'torch': torch.__version__, 'cuda': torch.version.cuda, 'gpu': torch.cuda.get_device_name(0), 'helper_sha256': HELPER_SHA256 if 'HELPER_SHA256' in globals() else sha256(__file__)}


def run_batch(repo, assets, output_dir, provenance, execute=None, clean_completed_attempts=True):
    """Resume per image/modality. One fresh subprocess per pending modality batch."""
    out, repo, assets = Path(output_dir).resolve(), Path(repo).resolve(), Path(assets).resolve()
    manifest = json.loads((out / 'manifest.json').read_text())
    if manifest['environment'] is not None and manifest['environment'] != provenance:
        raise ValueError('Code, environment or assets changed. Choose a new OUTPUT_DIR.')
    manifest['environment'] = provenance
    env = {**os.environ, 'DEPTH_ASSETS_DIR': str(assets), 'PYTHONUNBUFFERED': '1'}
    for row in manifest['images']:
        if sha256(out / row['input']) != row['input_sha256']:
            raise ValueError('Prepared input changed.')
    for modality in manifest['settings']['modalities']:
        pending = [r for r in manifest['images'] if not output_valid(out, r, modality)]
        if not pending:
            print(modality + ': all validated outputs already present', flush=True)
            continue
        attempt = out / 'attempts' / (modality + '-' + uuid.uuid4().hex[:12])
        inputs, outputs = attempt/'inputs', attempt/'outputs'
        inputs.mkdir(parents=True)
        for row in pending:
            target = inputs / (row['id'] + '.png')
            try:
                os.link(out / row['input'], target)
            except OSError:
                shutil.copyfile(out / row['input'], target)
        command = [sys.executable, str(repo/'scripts'/'infer.py'), '--modality', TASKS[modality]['modality'], '--checkpoint', str(assets/'checkpoints'/'Marigold-V2'/TASKS[modality]['checkpoint']), '--image_dir', str(inputs), '--output_dir', str(outputs), '--seed', str(manifest['settings']['seed'])]
        record = {'modality': modality, 'command': command, 'directory': attempt.relative_to(out).as_posix(), 'status': 'running', 'started_at': datetime.now(timezone.utc).isoformat()}
        manifest['attempts'].append(record)
        manifest['status'] = 'running'
        write_json(out/'manifest.json', manifest)
        print(f'{modality}: {len(pending)} pending photos. Log: {attempt / "inference.log"}', flush=True)
        interrupted = False
        try:
            if execute is None:
                with (attempt/'inference.log').open('w') as log:
                    process = subprocess.Popen(command, cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                    try:
                        record['returncode'] = process.wait()
                    except KeyboardInterrupt:
                        # infer.py launches the evaluator as a child. Stop the process tree.
                        try:
                            os.killpg(process.pid, signal.SIGTERM)
                        except ProcessLookupError:
                            pass
                        try:
                            process.wait(timeout=10)
                        except subprocess.TimeoutExpired:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait()
                        raise
            else:
                record['returncode'] = execute(command, repo, env, attempt/'inference.log')
        except KeyboardInterrupt:
            interrupted = True
            record['returncode'] = None
        except Exception as exc:
            record['returncode'] = None
            record['error'] = str(exc)
        record['status'] = 'complete' if record['returncode'] == 0 else 'interrupted' if interrupted else 'failed'
        record['finished_at'] = datetime.now(timezone.utc).isoformat()
        for row in pending:
            npy = outputs/'images'/'predictions_npy'/(row['id']+'.npy')
            png = outputs/'images'/'visualizations'/TASKS[modality]['preview']/(row['id']+'.png')
            try:
                stats = validate_output(npy, png, modality, row['input_size'])
                target = out/'results'/row['id']
                target.mkdir(parents=True, exist_ok=True)
                dest_npy, dest_png = target/(modality+'.npy'), target/(modality+'.png')
                shutil.copyfile(npy, dest_npy)
                shutil.copyfile(png, dest_png)
                row['outputs'][modality] = {'npy': dest_npy.relative_to(out).as_posix(), 'png': dest_png.relative_to(out).as_posix(), 'npy_sha256': sha256(dest_npy), 'png_sha256': sha256(dest_png), 'encoding': TASKS[modality]['encoding'], 'stats': stats, 'attempt': record['directory']}
                row.pop('last_error', None)
            except Exception as exc:
                row['outputs'].pop(modality, None)
                row['last_error'] = modality + ': ' + str(exc)
        manifest['status'] = 'partial'
        write_json(out/'manifest.json', manifest)
        # Persist and verify results before removing disposable CLI copies.
        # Retain failed attempts for diagnosis and preserve logs/configs always.
        if clean_completed_attempts and record['status'] == 'complete' and all(output_valid(out, r, modality) for r in pending):
            for folder in [inputs, outputs]:
                for path in folder.rglob('*'):
                    if path.is_file() and path.suffix not in {'.yaml', '.yml', '.log'}:
                        path.unlink()
            record['temporary_images_removed'] = True
            write_json(out/'manifest.json', manifest)
        if interrupted:
            raise KeyboardInterrupt('Interrupted; validated outputs saved. Rerun this cell to resume.')
        validated = sum(output_valid(out, row, modality) for row in pending)
        if record['returncode'] != 0 or validated != len(pending):
            print_attempt_failure(attempt, record)
        if validated == 0:
            print('No validated predictions in this attempt; stopping before the next modality. '
                  'Resolve the log error above, then retry.', flush=True)
            break
    manifest['status'] = 'complete' if all(output_valid(out, r, m) for r in manifest['images'] for m in manifest['settings']['modalities']) else 'partial'
    write_json(out/'manifest.json', manifest)
    return manifest


def export_zip(output_dir, include_originals=True):
    out = Path(output_dir).resolve()
    manifest = json.loads((out/'manifest.json').read_text())
    if manifest['status'] != 'complete' or not all(output_valid(out, r, m) for r in manifest['images'] for m in manifest['settings']['modalities']):
        raise ValueError('Run is incomplete or outputs changed. Resolve failures before final export.')
    archive = out.parent / (out.name + '-evidence-' + uuid.uuid4().hex[:8] + '.zip')
    temporary = archive.with_suffix('.zip.partial')
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=True) as z:
        for name in ['manifest.json', 'asset-lock.json', 'download-plan.json']:
            if (out/name).exists():
                z.write(out/name, name)
        for folder in ['inputs', 'results']:
            for path in sorted((out/folder).rglob('*')):
                if path.is_file():
                    z.write(path, path.relative_to(out).as_posix())
        for path in sorted((out/'attempts').rglob('*')):
            if path.is_file() and (path.name == 'inference.log' or path.suffix == '.yaml'):
                z.write(path, path.relative_to(out).as_posix())
        if include_originals:
            root = Path(manifest['settings']['source_root'])
            for row in manifest['images']:
                for source in [row] + row['aliases']:
                    path = (root/source['source']).resolve()
                    if not path.is_relative_to(root) or sha256(path) != source['source_sha256']:
                        raise ValueError('Original source changed before export.')
                    z.write(path, 'originals/' + source['source'])
    temporary.replace(archive)
    return archive
