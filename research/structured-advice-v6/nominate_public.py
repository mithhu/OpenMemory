"""Public development nominations only; no benchmark, labels, predictions or training."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT/'scripts/fine-tuning'))
from prepare_fresh_public_holdout_v1 import prior_inputs
CACHE=Path('/tmp/openmemory-v5-public-source')

def main():
 inventory=json.loads((ROOT/'docs/fine-tuning/classification-fresh-public-holdout-v1/prior-input-inventory.json').read_text())
 paths={ROOT/p for p in inventory if (ROOT/p).exists()}
 for pattern in ['**/train*.json','**/*holdout*.json','**/*review*.json','**/*labels*.json','**/*candidates*.json']:
  paths.update((ROOT/'docs/fine-tuning').glob(pattern))
 paths.update((ROOT/'research').glob('**/*.json'))
 texts,ids,_=prior_inputs(sorted(paths));norm=lambda s:' '.join(s.casefold().split());texts={norm(t) for t in texts}
 rows=[];exclusions=[];seed='v6-human-development-20261018'
 for intent in ['RateBook','BookRestaurant']:
  file=CACHE/f'train_{intent}_full.json';raw=file.read_bytes();data=json.loads(raw.decode('utf-8'))[intent]
  count=0
  for index,row in sorted(enumerate(data),key=lambda pair:hashlib.sha256(f'{seed}:{intent}:{pair[0]}'.encode()).hexdigest()):
   note=''.join(v['text'] for v in row['data']);id=f'snips:{intent}:train-full:{index}'
   if norm(note) in texts or id in ids:
    exclusions.append({'id':id,'reason':'prior-original-text-or-id'});continue
   rows.append({'id':id,'note':note,'sourceIntent':intent,'recordIndex':index,'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceSlots':row['data'],'scope':'Public development candidate, not final evaluation; task label not inferred from source intent.'});count+=1;texts.add(norm(note))
   if count==12:break
  if count!=12:raise ValueError('Insufficient eligible rows; no fallback')
 for name,data in [('public-development-nominations.json',rows),('public-development-screening.json',{'seed':seed,'priorArtifacts':len(paths),'exclusions':exclusions,'nominated':len(rows),'sourceEncoding':'strict UTF-8 (verified against original bytes)','scope':'Development wording only; no source-family/pretraining independence claim; no predictions used.'})]:
  with (HERE/name).open('x') as f:json.dump(data,f,indent=2,ensure_ascii=False);f.write('\n')
 print(json.dumps([{'id':r['id'],'note':r['note']} for r in rows],indent=2,ensure_ascii=False))
if __name__=='__main__':main()
