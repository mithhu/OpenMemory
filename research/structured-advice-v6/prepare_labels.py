"""Explicit reviewed migration to v6; never changes frozen v5 labels or scores."""
import copy,hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT/'scripts/app-mlx'))
from structured_advice_v6 import validate
SOURCE=ROOT/'research/structured-advice-v5/experiment-02/train.json'
GENERIC_WISHES=[
 'v5-r2-repair-033','structured-v5-development-022','v5-train-059',
 'structured-v5-development-008','v5-r2-repair-032','v5-r2-repair-031',
 'v5-train-050','v5-train-038','v5-r2-repair-062','v5-r2-repair-030',
 'v5-train-027','v5-train-048','v5-train-008',
]
IMPERATIVE_WISHES=['structured-v5-development-009','structured-v5-development-023']
FUTURE_REFERENCES=['v5-r2-repair-037','v5-r2-repair-038','v5-r2-repair-041','v5-r2-repair-042','v5-train-071','v5-r2-repair-036']

def prepare():
 source=json.loads(SOURCE.read_text());out=copy.deepcopy(source);changes=[]
 byid={r['id']:r for r in out}
 def change(id,reason,**fields):
  row=byid[id];before=copy.deepcopy(row['expected']);row['expected'].update(fields)
  changes.append({'id':id,'note':row['note'],'v5Expected':before,'v6Expected':copy.deepcopy(row['expected']),'rationale':reason,'changesHistoricalFile':False})
 for id in GENERIC_WISHES+IMPERATIVE_WISHES:
  change(id,'A generic media wish/request is meaningful without selecting a work. Imperatives follow the same prospective-wish rule as polite requests.',intent='wishlist',clarificationReasons=[])
 change('structured-v5-development-025','A song need not already be selected, but that singer is an unresolved artist constraint; keep the known wish.',clarificationReasons=['unresolved_reference'])
 for id in FUTURE_REFERENCES:
  change(id,'Preserve an explicit future wish while its referent/medium remains unresolved; this does not mark any activity as started or complete.',intent='wishlist')
 change('v5-r2-repair-023','Confirmed v5 label defect: that course is unnamed, so the known lesson-progress action retains a missing_identity reason.',clarificationReasons=['missing_identity'])
 for row in out:
  validate(row['expected'])
  row['labelVersion']=6
  row['sourceLabelId']=row['id']
  row['provenance']=row.get('provenance','')+' | Explicit v6 development migration; not held-out evaluation.'
 for name,data in [('train-reviewed-v6.json',out),('label-migration.json',{'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'rows':len(out),'changed':len(changes),'changes':changes,'evaluationGoldMigrated':False,'trainingExecuted':False})]:
  with (HERE/name).open('x') as f:json.dump(data,f,indent=2);f.write('\n')
 print(json.dumps({'rows':len(out),'explicitChanges':len(changes),'historicalGoldEdited':False}))
if __name__=='__main__':prepare()
