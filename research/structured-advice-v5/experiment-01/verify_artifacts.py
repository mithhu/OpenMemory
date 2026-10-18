"""Verify retained artifacts without model inference or modifying weights."""
import hashlib,json,math
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    import numpy as np
    from safetensors.numpy import load_file
    recipe=json.loads((HERE/'recipe.json').read_text())
    for n,h in recipe['files_sha256'].items():
        if sha(HERE/n)!=h:raise ValueError('Frozen input changed: '+n)
    model=ROOT/'.local-runtime/model'
    manifest=json.loads((HERE/'base-manifest.json').read_text())
    for n,h in {**manifest['base_weight_sha256'],**manifest['model_metadata_sha256']}.items():
        if sha(model/n)!=h:raise ValueError('Base changed: '+n)
    parent=ROOT/'artifacts/fine-tuning/classification-reviewed9b-v1/adapters.safetensors'
    candidate=ROOT/'artifacts/fine-tuning/structured-advice-v5-experiment-01/adapters.safetensors'
    if sha(parent)!=recipe['parent_adapter_sha256']:raise ValueError('Parent changed')
    old,new=load_file(parent),load_file(candidate)
    if old.keys()!=new.keys():raise ValueError('Architecture changed')
    deltas={}
    for k in old:
        if old[k].shape!=new[k].shape or not np.isfinite(new[k]).all():raise ValueError('Invalid tensor: '+k)
        diff=new[k].astype(np.float64)-old[k].astype(np.float64)
        deltas[k]={'parameters':int(new[k].size),'changed':int(np.count_nonzero(diff)),'l2':float(np.linalg.norm(diff))}
    steps=[json.loads(l) for l in (candidate.parent/'steps.jsonl').read_text().splitlines()]
    if len(steps)!=recipe['updates'] or any(r['step']!=i for i,r in enumerate(steps,1)) or any(not math.isfinite(r['loss']) for r in steps):raise ValueError('Incomplete steps')
    predictions={m:HERE/(m+'-predictions.jsonl') for m in ['base','parent','candidate']}
    for m,p in predictions.items():
        rows=[json.loads(l) for l in p.read_text().splitlines()]
        if len(rows)!=48:raise ValueError('Incomplete evaluation: '+m)
        completion=json.loads((HERE/(m+'-completed.json')).read_text())
        if completion['outputSha256']!=sha(p):raise ValueError('Output hash changed: '+m)
    result={'baseUnchanged':True,'parentUnchanged':True,'candidateSha256':sha(candidate),'parentSha256':sha(parent),'steps':len(steps),'trainableParameters':sum(v['parameters'] for v in deltas.values()),'changedParameters':sum(v['changed'] for v in deltas.values()),'perTensor':deltas,'firstTenMeanLoss':sum(r['loss'] for r in steps[:10])/10,'lastTenMeanLoss':sum(r['loss'] for r in steps[-10:])/10,'predictionHashes':{m:sha(p) for m,p in predictions.items()},'installed':False}
    if result['changedParameters']==0:raise ValueError('No actual weight update')
    with (HERE/'verification.json').open('x') as f:json.dump(result,f,indent=2);f.write('\n')
    print(json.dumps({k:v for k,v in result.items() if k!='perTensor'}))
if __name__=='__main__':main()
