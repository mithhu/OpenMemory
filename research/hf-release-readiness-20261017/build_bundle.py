"""Build a new adapter-only staging directory. Never edits the published release or uploads."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
SOURCE=ROOT/'.model-release/research-reviewed730-v1'

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',required=True);args=p.parse_args()
    target=Path(args.output);target.mkdir(parents=True,exist_ok=False)
    pins=json.loads((SOURCE/'checksums.json').read_text())
    for name in ['MODEL_CARD.md','NOTICE','LICENSE','DATA_SOURCES.md','FINAL_EVALUATION.md','training-recipe.json','base-manifest.json','requirements-mlx.txt','contract.py','core.py','download_base.py','adapter/adapters.safetensors','adapter/adapter_config.json']:
        if sha(SOURCE/name)!=pins[name]:raise ValueError('Original distribution changed: '+name)
    for name in ['NOTICE','LICENSE','DATA_SOURCES.md','FINAL_EVALUATION.md','training-recipe.json','base-manifest.json','requirements-mlx.txt','contract.py','core.py','download_base.py']:
        shutil.copy2(SOURCE/name,target/name)
    for name in ['adapters.safetensors','adapter_config.json']:shutil.copy2(SOURCE/'adapter'/name,target/name)
    shutil.copy2(HERE/'run_adapter.py',target/'run_adapter.py')
    shutil.copy2(HERE/'RELEASE_SCOPE.md',target/'RELEASE_SCOPE.md')
    card=(SOURCE/'MODEL_CARD.md').read_text()
    heading='# OpenMemory reviewed730 MLX adapter'
    card=card.replace(heading,heading+'\n\n**Experimental legacy-v3 research adapter. Not the TV-series or structured-v5 model.**\n\nThe frozen 200-note holdout improved over the same unadapted base (67.0% → 76.5% joint), but stayed below the 81.0% NOTE/none majority baseline. Labels were AI-assigned, not independent human gold. Several classes are poorly tested, and older qualification gates were not passed. This is an artifact of documented local fine-tuning, not a production-ready classifier or a frontier-model comparison.')
    card+='''\n## Current release boundary\n\nThis bundle preserves the reviewed730 adapter bytes and exact v3 prompt. SERIES is not an output label; neither season/episode tracking nor three-field structured advice was learned in this adapter. Two later TV training candidates failed their own retention gates and are excluded. Structured advice v5 is development policy/data only, not a trained released model. The app can have newer extraction/review features without this artifact gaining those model capabilities.\n\nLegacy clarify cannot distinguish missing identity from unknown action. Never convert it into a confident action or reason by guessing. Model labels do not authorize saving, identity resolution, title correction, quantities, dates or reminders.\n\n## Run locally\n\nRequires Apple silicon and the separately obtained pinned base, tested with Python 3.12.9 and `requirements-mlx.txt`. This is an MLX adapter, not a self-contained foundation model, GGUF/Ollama import, browser/WebGPU model, cloud API endpoint or Transformers pipeline. The small adapter file does not include the base model.\n\nFrom this downloaded adapter folder:\n\n```sh\npython -m pip install -r requirements-mlx.txt\npython download_base.py --output /absolute/path/to/base\npython run_adapter.py --base /absolute/path/to/base --verify-only\npython run_adapter.py --base /absolute/path/to/base --note "I want to read Sapiens."\n```\n\nThe downloader retrieves the pinned base separately and checks its files. Inference performs no automatic downloads, uploads or persistence. Prediction may be null if raw generation is invalid; it still requires review. The default inference directory is this adapter folder, not a nonexistent adapter subfolder. Download every listed file and avoid mixing versions.\n\n## Reproducibility and authorship\n\nThe public [research repository](https://github.com/mithhu/openmemory-local-classifier-research) contains all 730 ordered training rows, the recorded training trace, full paired evaluation outputs, recomputation/verification scripts, attribution and learning guide. A fresh full 730-update bit-identical reproduction has not been established: archived tokenization and a two-update trainer smoke check were verified. One local inference smoke check is not an accuracy evaluation.\n\nMahamudul Hasan Mithhu directed this substantially AI-assisted project. Describe it as local LoRA fine-tuning and honest evaluation; do not claim independent expert authorship, a unique capability no other model can solve, or superiority over frontier models. See RELEASE_SCOPE.md for the exact upload and exclusion boundary.\n'''
    (target/'README.md').write_text(card)
    checks={f.name:sha(f) for f in sorted(target.iterdir()) if f.is_file()}
    (target/'checksums.json').write_text(json.dumps(checks,indent=2)+'\n')
    print(json.dumps({'directory':str(target),'files':len(checks)+1,'adapterSha256':sha(target/'adapters.safetensors'),'uploaded':False}))

if __name__=='__main__':main()
