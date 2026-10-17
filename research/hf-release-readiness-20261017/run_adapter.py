"""Local-only experimental MLX inference. Never saves memories or downloads automatically."""
import argparse
import fcntl
import json
from pathlib import Path
from core import sha, parse_prediction
from contract import frozen_contract

HERE = Path(__file__).resolve().parent

def verify(base):
    pins=json.loads((HERE/'checksums.json').read_text())
    actual={p.name for p in HERE.iterdir() if p.is_file()}
    # Hub creates .gitattributes; it is transport metadata, not a model payload.
    if actual- {'.gitattributes'} != set(pins)|{'checksums.json'}: raise ValueError('Unexpected or missing bundle files')
    for name,expected in pins.items():
        if sha(HERE/name)!=expected:raise ValueError('Bundle changed: '+name)
    recipe=json.loads((HERE/'training-recipe.json').read_text())
    if sha(HERE/'adapters.safetensors')!=recipe['adapter_sha256']:raise ValueError('Wrong adapter')
    manifest=json.loads((HERE/'base-manifest.json').read_text())
    for name,expected in {**manifest['base_weight_sha256'],**manifest['model_metadata_sha256']}.items():
        if sha(base/name)!=expected:raise ValueError('Wrong base file: '+name)

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--base',required=True,help='Previously downloaded exact pinned base folder')
    p.add_argument('--note',help='A fictional note for a review-required prediction')
    p.add_argument('--verify-only',action='store_true')
    args=p.parse_args();base=Path(args.base)
    verify(base)
    if args.verify_only:
        print(json.dumps({'bundle_verified':True,'base_verified':True,'inference':False}));return
    if not args.note or len(args.note)>1000:raise ValueError('Provide a note of 1..1000 characters')
    with open('/tmp/openmemory-local-model-gpu.lock','a+') as lease:
        fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
        from mlx_lm import load,generate
        from mlx_lm.sample_utils import make_sampler
        model,tok=load(str(base),adapter_path=str(HERE),trust_remote_code=False)
        prompt=tok.apply_chat_template([{'role':'system','content':frozen_contract()['instructions']},
            {'role':'user','content':json.dumps({'note':args.note},ensure_ascii=False)}],tokenize=True,
            add_generation_prompt=True,enable_thinking=False,return_dict=False)
        if len(prompt)+80>2048:raise ValueError('Context exceeds bound; no truncation')
        raw=generate(model,tok,prompt=prompt,max_tokens=80,sampler=make_sampler(temp=0),verbose=False)
        print(json.dumps({'prediction':parse_prediction(raw),'raw':raw,'review_required':True},ensure_ascii=False))

if __name__=='__main__':main()
