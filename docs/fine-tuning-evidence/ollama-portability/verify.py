"""CPU-only integrity/arithmetic check; no model, GPU or original wording needed."""
import hashlib,json
from pathlib import Path
p=Path(__file__).resolve().parent
s=json.loads((p/'development-comparison.json').read_text())
raw=(p/'paired-development.json').read_bytes()
assert hashlib.sha256(raw).hexdigest()==s['exported_paired_rows_sha256']
r=json.loads(raw);assert len(r)==208 and len({x['id'] for x in r})==208
for key,field in [('ollama-base','ollama_base'),('converted-adapter','ollama_adapter')]:
 v=s['models'][key];intents=[x for x in r if x['intent'] is not None]
 scores={'category_correct':sum((x[field] or {}).get('category')==x['category'] for x in r),'category_total':len(r),'intent_correct':sum((x[field] or {}).get('intent')==x['intent'] for x in intents),'intent_total':len(intents),'valid_outputs':sum(x[field] is not None for x in r)}
 assert all(v[k]==n for k,n in scores.items())
 print(key,json.dumps(scores))
print('Verified exposed development arithmetic; not independent final-test qualification.')
