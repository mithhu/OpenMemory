"""Deterministic public wording nominations. No labels inferred from source intent."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/fine-tuning'))
from prepare_fresh_public_holdout_v1 import prior_inputs
CACHE=Path('/tmp/openmemory-v5-public-source')

def main():
 inventory=json.loads((ROOT/'docs/fine-tuning/classification-fresh-public-holdout-v1/prior-input-inventory.json').read_text())
 paths={ROOT/p for p in inventory if (ROOT/p).exists()}
 for pattern in ['**/train*.json','**/*holdout*.json','**/*review*.json','**/*labels*.json','**/*candidates*.json']:
  paths.update((ROOT/'docs/fine-tuning').glob(pattern))
 paths.update((ROOT/'research').glob('**/train.json'))
 paths.update((ROOT/'research').glob('**/qualification.json'))
 texts,ids,_=prior_inputs(sorted(paths))
 norm=lambda t:' '.join(t.casefold().split())
 texts={norm(t) for t in texts}
 nominations=[];excluded=[]
 for intent in ['PlayMusic','RateBook','BookRestaurant']:
  path=CACHE/f'train_{intent}_full.json'
  source=json.loads(path.read_bytes().decode('latin-1'))[intent]
  ordered=sorted(enumerate(source),key=lambda x:hashlib.sha256(f'v5-r2-public-20261018:{intent}:{x[0]}'.encode()).hexdigest())
  accepted=0
  for index,row in ordered:
   note=''.join(chunk['text'] for chunk in row['data'])
   id=f'snips:{intent}:train-full:{index}'
   if norm(note) in texts or id in ids:
    excluded.append({'id':id,'reason':'normalized-exact-prior-input-or-id'});continue
   nominations.append({'id':id,'note':note,'sourceIntent':intent,'recordIndex':index,'sourceFileSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'sourceSlots':row['data']})
   texts.add(norm(note));accepted+=1
   if accepted==8:break
  if accepted!=8:raise ValueError('Source shortage; no fallback')
 for name,data in [('public-nominations.json',nominations),('public-screening.json',{'priorArtifacts':len(paths),'priorOriginalExpressions':len(texts),'excluded':excluded,'seed':'v5-r2-public-20261018','normalization':'casefold+whitespace','limits':'Exact screening is not semantic, source-family or pretraining independence. SNIPS was used in earlier project work; source is not globally held out.'})]:
  with (HERE/name).open('x') as f:json.dump(data,f,indent=2,ensure_ascii=False);f.write('\n')
 (HERE/'public-source-manifest.json').write_bytes((CACHE/'source-manifest.json').read_bytes())
 print(json.dumps([{'id':r['id'],'note':r['note']} for r in nominations],indent=2,ensure_ascii=False))
if __name__=='__main__':main()
