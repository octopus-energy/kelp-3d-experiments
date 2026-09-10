"""CPU integration tests with a fake prediction writer; never download/run models."""
import hashlib,json,tempfile,unittest,zipfile
import io
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
import numpy as np
from PIL import Image
import marigold_batch as B

class BatchTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.photos=self.root/'photos';self.photos.mkdir()
        Image.new('RGB',(48,32),(20,30,40)).save(self.photos/'one.png')
        (self.photos/'nested').mkdir()
        Image.new('RGB',(32,48),(50,60,70)).save(self.photos/'nested'/'one.png')
        Image.new('RGB',(48,32),(20,30,40)).save(self.photos/'alias.png')
        Image.new('RGB',(48,32)).save(self.photos/'rear_depth.webp')
        (self.photos/'corrupt.jpg').write_bytes(b'not an image')
        self.out=self.root/'outputs'
        found,skipped=B.discover(self.photos)
        self.manifest=B.prepare(self.photos,self.out,found,skipped,list(B.TASKS),64)
        self.calls=[]

    def fake(self,command,repo,env,log,partial=False):
        inputs=Path(command[command.index('--image_dir')+1]);out=Path(command[command.index('--output_dir')+1])
        modality=command[command.index('--modality')+1];paths=sorted(inputs.glob('*.png'))
        self.calls.append((modality,len(paths)));Path(log).write_text('Fake inference for CPU test only')
        self.assertNotIn('--width',command);self.assertNotIn('--height',command)
        if partial:paths=paths[:1]
        preview=B.TASKS[modality]['preview']
        for path in paths:
            with Image.open(path) as im:w,h=im.size
            arr=np.full((h,w),.5,np.float32) if modality=='depth' else np.zeros((3,h,w),np.float32)
            if modality=='normals':arr[2]=1
            npy=out/'images'/'predictions_npy'/(path.stem+'.npy');npy.parent.mkdir(parents=True,exist_ok=True);np.save(npy,arr)
            png=out/'images'/'visualizations'/preview/(path.stem+'.png');png.parent.mkdir(parents=True,exist_ok=True);Image.new('RGB',(w,h)).save(png)
        (out/'config.yaml').write_text('test: true\n')
        return 1 if partial else 0

    def test_discovery_dedup_and_no_collisions(self):
        self.assertEqual(len(self.manifest['images']),2)
        self.assertEqual(sum(len(r['aliases']) for r in self.manifest['images']),1)
        self.assertEqual(len(self.manifest['skipped']),2)
        self.assertEqual(len({r['id'] for r in self.manifest['images']}),2)
        self.assertEqual(self.manifest,B.prepare(self.photos,self.out,*B.discover(self.photos),list(B.TASKS),64))
        with self.assertRaisesRegex(ValueError,'changed'):
            B.prepare(self.photos,self.out,*B.discover(self.photos),list(B.TASKS),128)
        with self.assertRaisesRegex(ValueError,'separate'):
            B.prepare(self.photos,self.photos/'output',*B.discover(self.photos),list(B.TASKS),64)

    def test_exif_orientation_recorded(self):
        other=self.root/'oriented';other.mkdir();im=Image.new('RGB',(60,30));exif=im.getexif();exif[274]=6;im.save(other/'rotated.jpg',exif=exif)
        found,skipped=B.discover(other);self.assertEqual(found[0]['oriented_size'],[30,60]);self.assertEqual(found[0]['exif_orientation'],6)
        m=B.prepare(other,self.root/'rotated-output',found,skipped,['depth'],64)
        self.assertEqual(m['images'][0]['input_size'],[30,60])

    def test_complete_resume_and_export(self):
        m=B.run_batch(self.root,self.root,self.out,{'test':'CPU fake'},self.fake)
        self.assertEqual(m['status'],'complete');self.assertEqual(len(self.calls),4)
        for attempt in m['attempts']:
            directory=self.out/attempt['directory']
            self.assertEqual(list(directory.rglob('*.npy')),[])
            self.assertEqual(list(directory.rglob('*.png')),[])
            self.assertTrue((directory/'inference.log').exists())
            self.assertTrue((directory/'outputs'/'config.yaml').exists())
        self.assertEqual(len(list((self.out/'inputs').glob('*.png'))),2)
        B.run_batch(self.root,self.root,self.out,{'test':'CPU fake'},self.fake)
        self.assertEqual(len(self.calls),4)
        archive=B.export_zip(self.out)
        with zipfile.ZipFile(archive) as z:
            self.assertEqual(len([n for n in z.namelist() if n.endswith('.npy')]),8)
            self.assertIn('originals/nested/one.png',z.namelist());self.assertIn('originals/alias.png',z.namelist())
            exported=json.loads(z.read('manifest.json'));self.assertEqual(exported['status'],'complete')
        with self.assertRaisesRegex(ValueError,'environment'):
            B.run_batch(self.root,self.root,self.out,{'test':'changed'},self.fake)

    def test_partial_and_corrupt_resume(self):
        count=0
        def flaky(*args):
            nonlocal count
            count+=1
            return self.fake(*args,partial=count==1)
        m=B.run_batch(self.root,self.root,self.out,{'test':True},flaky)
        self.assertEqual(m['status'],'partial')
        with self.assertRaisesRegex(ValueError,'incomplete'):B.export_zip(self.out)
        m=B.run_batch(self.root,self.root,self.out,{'test':True},self.fake)
        self.assertEqual(m['status'],'complete');self.assertEqual(self.calls[-1],('depth',1))
        record=m['images'][0]['outputs']['normals'];np.save(self.out/record['npy'],np.array([np.nan],np.float32))
        m=B.run_batch(self.root,self.root,self.out,{'test':True},self.fake)
        self.assertEqual(self.calls[-1],('normals',1));self.assertEqual(m['status'],'complete')

    def test_import_failure_is_visible_and_stops_empty_pass(self):
        error="ModuleNotFoundError: No module named 'bitsandbytes'"
        with patch.object(B.subprocess,'run',return_value=SimpleNamespace(returncode=1,stdout=error)) as run:
            output=io.StringIO()
            with redirect_stdout(output),self.assertRaisesRegex(RuntimeError,'dependency check failed'):
                B.check_inference_imports(self.root)
            self.assertIn(error,output.getvalue())
            self.assertEqual(run.call_args.args[0][0],B.sys.executable)
        calls=[]
        def failed(command,repo,env,log):
            calls.append(command);Path(log).write_text(error);return 1
        output=io.StringIO()
        with redirect_stdout(output):
            m=B.run_batch(self.root,self.root,self.out,{'test':'missing dependency'},failed)
        self.assertEqual(len(calls),1,'Do not launch the other three models after an empty failed pass')
        self.assertEqual(m['status'],'partial');self.assertIn(error,output.getvalue())
        self.assertEqual(len(m['attempts']),1)
        self.assertEqual(m['attempts'][0]['returncode'],1)
        with self.assertRaisesRegex(ValueError,'environment'):
            B.run_batch(self.root,self.root,self.out,{'test':'repaired dependency'},self.fake)

    def test_qwen_forward_compatibility(self):
        class Compatible:
            def forward(self,hidden_states,timestep=None,encoder_hidden_states=None,
                        encoder_hidden_states_mask=None,img_shapes=None,txt_seq_lens=None,
                        guidance=None,attention_kwargs=None,return_dict=False):pass
        class Incompatible:
            def forward(self,hidden_states,timestep=None,encoder_hidden_states=None,
                        encoder_hidden_states_mask=None,img_shapes=None,
                        guidance=None,attention_kwargs=None,return_dict=False):pass
        with patch.dict(B.sys.modules,{'diffusers':SimpleNamespace(__version__='0.38.0',QwenImageTransformer2DModel=Compatible)}):
            with redirect_stdout(io.StringIO()):exec(B.QWEN_API_CHECK,{})
        with patch.dict(B.sys.modules,{'diffusers':SimpleNamespace(__version__='0.38.0',QwenImageTransformer2DModel=Incompatible)}):
            with self.assertRaisesRegex(TypeError,'txt_seq_lens'):exec(B.QWEN_API_CHECK,{})
        with patch.dict(B.sys.modules,{'diffusers':SimpleNamespace(__version__='0.39.0',QwenImageTransformer2DModel=Compatible)}):
            with self.assertRaisesRegex(RuntimeError,'found 0.39.0'):exec(B.QWEN_API_CHECK,{})

    def test_invalid_arrays_and_changed_source(self):
        npy=self.root/'bad.npy';png=self.root/'bad.png';Image.new('RGB',(48,32)).save(png)
        for array in [np.zeros((48,32),np.float32),np.zeros((32,48),np.float64),np.full((32,48),np.nan,np.float32)]:
            np.save(npy,array)
            with self.assertRaises(ValueError):B.validate_output(npy,png,'depth',[48,32])
        B.run_batch(self.root,self.root,self.out,{},self.fake)
        (self.photos/'one.png').write_bytes(b'changed')
        with self.assertRaisesRegex(ValueError,'changed'):B.export_zip(self.out)
        self.assertEqual(list(self.root.glob('*.zip')),[],'No apparently complete archive after a failed export')

    def test_selective_download_and_disk_guard(self):
        names={
            'Qwen/Qwen-Image-Edit-2509': ['transformer/model.safetensors','vae/model.safetensors',
                                         'text_encoder/model.safetensors','tokenizer/config.json'],
            'huawei-bayerlab/marigold-v2-0': ['depth/Log-stage2/model.safetensors',
                'depth/Log-layered/model.safetensors','depth/Disparity-base/model.safetensors',
                'normals/model.safetensors','albedo/model.safetensors'] +
                ['qwen_text_embeddings/'+prefix+suffix for prefix in B.EMBED_PREFIXES.values()
                 for suffix in ['_prompt_embeds.pt','_prompt_mask.pt']]}
        class API:
            def model_info(self,repo_id,revision,files_metadata):
                assert revision==B.MODEL_REVISIONS[repo_id] and files_metadata
                return SimpleNamespace(siblings=[SimpleNamespace(rfilename=n,size=100) for n in names[repo_id]])
        assets=self.root/'assets';assets.mkdir();calls=[]
        plan=B.plan_assets(assets,['depth','depth_seethrough'],api=API())
        chosen=[f['name'] for s in plan for f in s['files']]
        self.assertEqual(len(chosen),6)
        self.assertFalse(any('text_encoder' in n or 'Disparity' in n or 'normals' in n or 'albedo' in n for n in chosen))
        with patch.object(B.shutil,'disk_usage',return_value=SimpleNamespace(free=599)):
            with self.assertRaisesRegex(OSError,'Insufficient disk'):
                B.download_inference_assets(assets,['depth','depth_seethrough'],0,api=API(),download=lambda **kw:calls.append(kw))
        self.assertEqual(calls,[],'No large transfers before the disk check passes')
        target=assets/'checkpoints'/'Qwen-Image-Edit-2509'/'transformer'/'model.safetensors'
        target.parent.mkdir(parents=True);target.write_bytes(b'x'*100)
        plan=B.plan_assets(assets,['depth','depth_seethrough'],api=API())
        self.assertEqual(sum(f['missing_bytes'] for s in plan for f in s['files']),500)
        with patch.object(B.shutil,'disk_usage',return_value=SimpleNamespace(free=500)):
            B.download_inference_assets(assets,['depth','depth_seethrough'],0,api=API(),download=lambda **kw:calls.append(kw))
        self.assertEqual(len(calls),2)
        self.assertTrue(all(c['max_workers']==1 and 'local_dir' in c for c in calls))
        self.assertEqual(calls[0]['allow_patterns'],['transformer/model.safetensors','vae/model.safetensors'])

    def test_cleanup_scope_and_opt_in(self):
        assets=self.root/'assets';qwen=assets/'checkpoints'/'Qwen-Image-Edit-2509';marigold=assets/'checkpoints'/'Marigold-V2'
        required=[qwen/'transformer'/'weights',qwen/'vae'/'weights',marigold/'depth'/'Log-stage2'/'weights',
                  marigold/'qwen_text_embeddings'/(B.EMBED_PREFIXES['depth']+'_prompt_embeds.pt')]
        unused=[qwen/'text_encoder'/'weights',qwen/'.cache'/'huggingface'/'download'/'text_encoder'/'weights.incomplete',
                marigold/'depth'/'Disparity-base'/'weights',marigold/'qwen_text_embeddings'/'unused.pt']
        for p in required+unused:p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'weight')
        report=B.prune_unused_assets(assets,['depth'])
        self.assertEqual(sum(r['bytes'] for r in report),24)
        self.assertTrue(all(p.exists() for p in unused),'Dry run must not delete')
        B.prune_unused_assets(assets,['depth'],dry_run=False)
        self.assertTrue(all(p.exists() for p in required))
        self.assertTrue(all(not p.exists() for p in unused))
        self.assertTrue((self.photos/'one.png').exists())
        self.assertTrue((self.out/'manifest.json').exists())

    def test_notebook_cells_and_embedded_source(self):
        here=Path(__file__).resolve().parent
        nb=json.loads((here/'marigold-folder.ipynb').read_text());self.assertEqual(nb['nbformat'],4)
        helper=(here/'marigold_batch.py').read_text();self.assertEqual(nb['metadata']['marigold_helper_sha256'],hashlib.sha256(helper.encode()).hexdigest())
        embedded=[c for c in nb['cells'] if c['cell_type']=='code' and ''.join(c['source']).startswith('HELPER_SHA256')][0]
        self.assertEqual(''.join(embedded['source']).split('\n',1)[1],helper)
        for i,c in enumerate(nb['cells']):
            if c['cell_type']=='code':compile(''.join(c['source']),f'cell-{i}','exec');self.assertEqual(c['outputs'],[])

if __name__=='__main__':unittest.main()
