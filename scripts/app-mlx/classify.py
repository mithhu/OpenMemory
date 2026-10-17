"""Experimental reviewed730 app classifier. No training or save authority."""
import fcntl, hashlib, json, os, subprocess, sys, time, urllib.request
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
PYTHON = str(ROOT / '.local-runtime/venv/bin/python')
ADAPTER = ROOT / 'artifacts/fine-tuning/classification-reviewed9b-v1'
ADAPTER_SHA = '8724245782e5c709bf7ccd7b3631a944472bfb071d6cc659a9bcc5cb51143f01'
CONFIG_SHA = 'e820b01eaff1458b34045db045d706409c672a40f7e304f9defdc35adde8da3f'
CONTRACT_SHA = '47f23a8c1271206ab520927a3e62dfc406e90e481bdf8507e1ac2b00c1e863df'
JOINT_DECODER_SHA = 'cdb635dd1df78e00f37859b45fc08737ce6444b29b8ae82599860f45373b89e2'
OUTPUT_WRAPPER_SHA = 'cb7692f36790fb88648702c46baa329bde6b7e2d5b34ccc2f425b36129c23239'
EXTRACTOR = 'qwen3.5:9b'
EXTRACTOR_SHA = '6488c96fa5faab64bb65cbd30d4289e20e6130ef535a93ef9a49f42eda893ea7'

def sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024*1024), b''): h.update(block)
    return h.hexdigest()

def ollama(path, data=None):
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request('http://127.0.0.1:11434/api/'+path, data=body, headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r: return json.load(r)

def strict(raw):
    def pairs(items):
        out={}
        for k,v in items:
            if k in out: raise ValueError('Duplicate JSON field')
            out[k]=v
        return out
    return json.loads(raw, object_pairs_hook=pairs)

def worker(text):
    import importlib.metadata
    if sys.version.split()[0]!='3.12.9' or any(importlib.metadata.version(p)!=v for p,v in {'mlx':'0.32.3','mlx-lm':'0.32.0','transformers':'5.19.0','tokenizers':'0.23.2','numpy':'2.5.3'}.items()):
        raise ValueError('Evaluated runtime versions changed')
    recipe_path=ROOT / 'scripts/app-mlx/model-manifest.json'
    if sha(recipe_path)!='b763acbbd2f8309cd9387da869ac8e26539c091a248d3ae2aa845d15ba84f235':
        raise ValueError('Pinned runtime model manifest changed')
    recipe = json.loads(recipe_path.read_text())
    base = ROOT / '.local-runtime/model'
    for p, expected in [(ADAPTER/'adapters.safetensors',ADAPTER_SHA), (ADAPTER/'adapter_config.json',CONFIG_SHA), (ROOT/'scripts/app-mlx/classification_contract.py',CONTRACT_SHA), (ROOT/'scripts/app-mlx/joint_decoder.py',JOINT_DECODER_SHA), (ROOT/'scripts/app-mlx/classification_output.py',OUTPUT_WRAPPER_SHA)]:
        if sha(p) != expected: raise ValueError('Pinned classifier artifact changed')
    for name,expected in {**recipe['base_weight_sha256'],**recipe['model_metadata_sha256']}.items():
        if sha(base/name) != expected: raise ValueError('Pinned base model changed')
    sys.path.insert(0, str(ROOT/'scripts/app-mlx'))
    from classification_contract import frozen_contract, validate_prediction
    from classification_output import classify_output
    from joint_decoder import JointDecoder
    from mlx_lm import load, generate
    from mlx_lm.sample_utils import make_sampler
    import mlx.core as mx
    start=time.monotonic()
    model,tokenizer=load(str(base),adapter_path=str(ADAPTER),trust_remote_code=False)
    tokens=tokenizer.apply_chat_template([{'role':'system','content':frozen_contract()['instructions']},{'role':'user','content':json.dumps({'note':text},ensure_ascii=False)}],tokenize=True,add_generation_prompt=True,enable_thinking=False,return_dict=False)
    if len(tokens)+80>2048: raise ValueError('Note exceeds classifier context; no truncation')
    def generate_raw(constrained):
        kwargs = {'logits_processors': [JointDecoder(tokenizer, len(tokens))]} if constrained else {}
        return generate(model,tokenizer,prompt=tokens,max_tokens=80,sampler=make_sampler(temp=0),verbose=False,**kwargs)
    advice, _ = classify_output(generate_raw, lambda raw: validate_prediction(strict(raw)))
    return {'advice':advice, 'adapterSha256':ADAPTER_SHA, 'seconds':round(time.monotonic()-start,3), 'peakBytes':mx.get_peak_memory()}

def main():
    data=strict(sys.stdin.read(2001)); text=data['text']
    if set(data)!={'text'} or not isinstance(text,str) or not text.strip() or len(json.dumps({'note':text},ensure_ascii=False).encode())>1000: raise ValueError('Short nonempty source required')
    if '--worker' in sys.argv:
        fd=int(os.environ['OPENMEMORY_APP_MLX_LEASE_FD'])
        if os.fstat(fd).st_ino != os.stat('/tmp/openmemory-local-model-gpu.lock').st_ino:
            raise ValueError('Canonical inherited GPU lease required')
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        print(json.dumps(worker(text))); return
    started=time.monotonic()
    # Keep the canonical inode; retain the parent lease until the actual child exits.
    with open('/tmp/openmemory-local-model-gpu.lock','a+') as lease:
        fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
        tags=ollama('tags')['models']
        matches=[m for m in tags if m['name']==EXTRACTOR and m['digest']==EXTRACTOR_SHA]
        if len(matches)!=1: raise ValueError('Pinned local extractor unavailable')
        resident=ollama('ps')['models']
        if any(m['name']!=EXTRACTOR for m in resident): raise ValueError('Another local model is running; stop it before MLX testing')
        if resident: ollama('generate',{'model':EXTRACTOR,'keep_alive':0})
        if ollama('ps')['models']: raise ValueError('Ollama is still resident; MLX not started')
        child=subprocess.run([PYTHON,str(Path(__file__).resolve()),'--worker'],input=json.dumps(data,ensure_ascii=False),text=True,capture_output=True,timeout=120,pass_fds=(lease.fileno(),),env={**os.environ,'OPENMEMORY_APP_MLX_LEASE_FD':str(lease.fileno())})
        if child.returncode: raise RuntimeError('MLX classification failed: '+child.stderr[-1500:])
        result=strict(child.stdout)
        result['totalSeconds']=round(time.monotonic()-started,3)
        # Log model identity, labels, timings, source hash only; never original note.
        log={**result,'sourceSha256':hashlib.sha256(text.encode()).hexdigest(),'at':time.time()}
        if os.environ.get('OPENMEMORY_MLX_TEST')=='1':
            log_path=ROOT/'.local-runtime/classification-runtime.jsonl'
            with log_path.open('a') as f: f.write(json.dumps(log)+'\n')
        print(json.dumps(result))

if __name__=='__main__': main()
