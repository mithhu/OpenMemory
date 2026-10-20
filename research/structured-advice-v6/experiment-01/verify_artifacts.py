"""Post-run hashes and weight deltas, without inference or modifying checkpoints."""
import hashlib,json,math,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def main():
 import numpy as np
 from safetensors.numpy import load_file
 recipe=json.loads((HERE/'recipe.json').read_text())
 for path,expected in recipe['files_sha256'].items():
  if sha(HERE/path)!=expected:raise ValueError('Frozen input changed: '+path)
 manifest=json.loads((HERE/'base-manifest.json').read_text())
 for path,expected in {**manifest['base_weight_sha256'],**manifest['model_metadata_sha256']}.items():
  if sha(ROOT/'.local-runtime/model'/path)!=expected:raise ValueError('Base changed: '+path)
 parent=ROOT/'artifacts/fine-tuning/structured-advice-v5-experiment-02'
 installed=ROOT/'artifacts/fine-tuning/classification-reviewed9b-v1'
 candidate=ROOT/'artifacts/fine-tuning/structured-advice-v6-experiment-01'
 if sha(parent/'adapters.safetensors')!=recipe['parent_adapter_sha256']:raise ValueError('Parent changed')
 if sha(installed/'adapters.safetensors')!=recipe['installed_adapter_sha256']:raise ValueError('Installed changed')
 old=load_file(parent/'adapters.safetensors');new=load_file(candidate/'adapters.safetensors')
 if old.keys()!=new.keys():raise ValueError('Architecture changed')
 changed=0;parameters=0;deltas={}
 for key in old:
  if old[key].shape!=new[key].shape or not np.isfinite(new[key]).all():raise ValueError('Invalid tensor')
  delta=new[key].astype(np.float64)-old[key].astype(np.float64)
  count=int(np.count_nonzero(delta));changed+=count;parameters+=new[key].size
  deltas[key]={'changed':count,'parameters':int(new[key].size),'l2':float(np.linalg.norm(delta))}
 if not changed:raise ValueError('No parameters changed')
 steps=[json.loads(s) for s in (candidate/'steps.jsonl').read_text().splitlines()]
 if len(steps)!=recipe['updates'] or any(r['step']!=i or not math.isfinite(r['loss']) for i,r in enumerate(steps,1)):raise ValueError('Incomplete/nonfinite training')
 prediction_hashes={}
 for model in ['base','installed','parent','candidate']:
  path=HERE/(model+'-predictions.jsonl');rows=[json.loads(s) for s in path.read_text().splitlines()]
  if len(rows)!=72:raise ValueError('Incomplete evaluation')
  completion=json.loads((HERE/(model+'-completed.json')).read_text())
  prediction_hashes[model]=sha(path)
  if completion['outputSha256']!=sha(path):raise ValueError('Prediction hash changed')
 result={'baseUnchanged':True,'parentUnchanged':True,'installedAppAdapterUnchanged':True,'candidateSha256':sha(candidate/'adapters.safetensors'),'steps':len(steps),'trainableParameters':int(parameters),'changedParameters':changed,'perTensor':deltas,'firstTenMeanLoss':sum(r['loss'] for r in steps[:10])/10,'lastTenMeanLoss':sum(r['loss'] for r in steps[-10:])/10,'predictionHashes':prediction_hashes,'installed':False}
 with (HERE/'verification.json').open('x') as f:json.dump(result,f,indent=2);f.write('\n')
 for src,dst in [('steps.jsonl','training-steps.jsonl'),('tokenization.json','training-tokenization.json'),('completed.json','training-completed.json')]:
  with (HERE/dst).open('xb') as f:f.write((candidate/src).read_bytes())
 print(json.dumps({k:v for k,v in result.items() if k!='perTensor'}))
if __name__=='__main__':main()
