"""Create a local adapter-only backup; never uploads or includes base weights."""
import json
import zipfile
from pathlib import Path
from run import HERE, ROOT, OUTPUT, sha

def main():
    if not (HERE/'results.json').exists() or not (HERE/'supervisor-completed.json').exists():
        raise ValueError('Require completed comparison first')
    target=ROOT/'.model-release/tv-series-experimental-v1-backup.zip'
    if target.exists(): raise FileExistsError('Never silently replace a backup')
    public=ROOT/'.model-release/research-reviewed730-v1'
    with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ['adapters.safetensors','adapter_config.json','completed.json']:
            archive.write(OUTPUT/name,'adapter/'+name)
        for path in sorted(HERE.iterdir()):
            if path.is_file() and path.suffix in {'.py','.json','.jsonl','.md'} and path.name!='backup.json':
                archive.write(path,'research/'+path.name)
        for name in ['LICENSE','NOTICE','DATA_SOURCES.md']:
            archive.write(public/name,name)
    with zipfile.ZipFile(target) as archive:
        import hashlib
        if hashlib.sha256(archive.read('adapter/adapters.safetensors')).hexdigest()!=sha(OUTPUT/'adapters.safetensors'):
            raise ValueError('Archived adapter mismatch')
    result={'path':str(target.relative_to(ROOT)),'bytes':target.stat().st_size,'sha256':sha(target),'adapterSha256':sha(OUTPUT/'adapters.safetensors'),'containsBaseWeights':False,'uploaded':False}
    (HERE/'backup.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))

if __name__=='__main__':main()
