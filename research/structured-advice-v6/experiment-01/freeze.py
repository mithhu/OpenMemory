"""Freeze one bounded recipe before model inference, no weight updates here."""
import hashlib,json,os,platform,importlib.metadata
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 files=[p for p in HERE.iterdir() if p.suffix in {'.py','.json','.md'} and p.name not in {'recipe.json','runtime.json'}]
 files += [ROOT/'scripts/app-mlx/structured_advice_v6.py',ROOT/'scripts/app-mlx/classification_advice_v6.json']
 data={'status':'frozen-before-training-and-predictions','base':'mlx-community/Qwen3.5-9B-4bit',
  'parent_adapter_sha256':sha(ROOT/'artifacts/fine-tuning/structured-advice-v5-experiment-02/adapters.safetensors'),
  'parent_meaning':'Rejected v5 experiment-02 used for warm-start and as a new-prompt comparator.',
  'installed_adapter_sha256':sha(ROOT/'artifacts/fine-tuning/classification-reviewed9b-v1/adapters.safetensors'),
  'updates':211,'epochs':1,'batch_size':1,'seed':2026101901,'learning_rate':5e-6,'max_sequence_tokens':3072,'response_window':128,
  'lora':{'rank':8,'scale':20.0,'dropout':0.0,'layers':1},
  'limits':{'total_seconds':3600,'training_seconds':1200,'each_evaluation_seconds':600,'observed_mlx_allocation_bytes':8000000000},
  'qualification':'48 fresh fictional AI-authored notes and 24 exact-original SNIPS queries (19 scored; 5 predeclared unscored). No independent human-label or source-family-heldout claim.',
  'gates':'Frozen in summarize.py. Compare identical raw v6-prompt responses from base, installed adapter transfer probe, previous v5 candidate and new v6 candidate. Require joint improvement over base, no previous-candidate regression overall/series/movie/book/lesson/uncertainty/public, zero invalid outputs and zero partial-series/course false completion. Passing only permits compatibility checks. One candidate; no test-guided rerun.',
  'files_sha256':{os.path.relpath(p,HERE):sha(p) for p in sorted(files)}}
 with (HERE/'recipe.json').open('x') as f:json.dump(data,f,indent=2);f.write('\n')
 runtime={'python':platform.python_version(),'platform':platform.platform(),'packages':{p:importlib.metadata.version(p) for p in ['mlx','mlx-lm','transformers','tokenizers','numpy']}}
 with (HERE/'runtime.json').open('x') as f:json.dump(runtime,f,indent=2);f.write('\n')
 print(json.dumps({'recipeFrozen':True,'files':len(files),'runtime':runtime}))
if __name__=='__main__':main()
