import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import run_adapter

class BundleIntegrity(unittest.TestCase):
    def make_bundle(self,path):
        model=path/'base';model.mkdir();(model/'weight.bin').write_bytes(b'base fixture')
        bundle=path/'adapter';bundle.mkdir();(bundle/'adapters.safetensors').write_bytes(b'adapter fixture')
        sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
        (bundle/'training-recipe.json').write_text(json.dumps({'adapter_sha256':sha(bundle/'adapters.safetensors')}))
        (bundle/'base-manifest.json').write_text(json.dumps({'base_weight_sha256':{'weight.bin':sha(model/'weight.bin')},'model_metadata_sha256':{}}))
        (bundle/'checksums.json').write_text(json.dumps({p.name:sha(p) for p in bundle.iterdir()}))
        return model,bundle
    def test_hub_metadata_does_not_break_integrity(self):
        with tempfile.TemporaryDirectory() as path:
            model,bundle=self.make_bundle(Path(path));(bundle/'.gitattributes').write_text('*.safetensors filter=lfs\n')
            with patch.object(run_adapter,'HERE',bundle):run_adapter.verify(model)
    def test_tampered_payload_fails(self):
        with tempfile.TemporaryDirectory() as path:
            model,bundle=self.make_bundle(Path(path));(bundle/'adapters.safetensors').write_bytes(b'changed')
            with patch.object(run_adapter,'HERE',bundle),self.assertRaises(ValueError):run_adapter.verify(model)
    def test_wrong_base_fails(self):
        with tempfile.TemporaryDirectory() as path:
            model,bundle=self.make_bundle(Path(path));(model/'weight.bin').write_bytes(b'wrong base')
            with patch.object(run_adapter,'HERE',bundle),self.assertRaises(ValueError):run_adapter.verify(model)
    def test_unexpected_file_fails(self):
        with tempfile.TemporaryDirectory() as path:
            model,bundle=self.make_bundle(Path(path));(bundle/'other_model.bin').write_bytes(b'not a payload')
            with patch.object(run_adapter,'HERE',bundle),self.assertRaises(ValueError):run_adapter.verify(model)

if __name__=='__main__':unittest.main()
