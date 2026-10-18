"""Pre-training manual policy judgments; never infers gold from source intent/slots."""
import hashlib,json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
sys.path.insert(0,str(ROOT/'scripts/app-mlx'))
from structured_advice_v6 import validate
# Unspecified reading types or an unclear medium/subject stay quarantined, not guessed.
LABELS=[
 ('BOOK','reaction',['missing_identity']),('BOOK','reaction',['missing_identity']),None,None,None,None,None,None,None,
 ('BOOK','reaction',['missing_identity']),None,('BOOK','reaction',['missing_identity']),
 *[('WISHLIST','wishlist',[]) for _ in range(7)],None,
 *[('WISHLIST','wishlist',[]) for _ in range(4)],
]
def main():
 nominees=json.loads((HERE/'public-development-nominations.json').read_text())
 assert len(nominees)==len(LABELS)==24
 labeled=[];accepted=[]
 for row,label in zip(nominees,LABELS):
  gold=validate(dict(zip(['category','intent','clarificationReasons'],label))) if label else None
  reason=('Explicit book/novel rating: reaction, not progress; unnamed specific work retains missing_identity.' if gold and gold['category']=='BOOK' else
   'Explicit nonmedia booking/search/dining wish; venue identity is not required.' if gold else
   'Unsupported essay type, insufficient explicit medium for a named rated work, or unclear ownership of a third-party plan. Requires separate review; hidden source intent is not enough.')
  labeled.append({**row,'expected':gold,'labelVersion':6,'labelStatus':'provisional-development-label-needs-separate-review' if gold else 'quarantined-ambiguous-not-training','rationale':reason,'independentHumanLabel':False})
  if gold:accepted.append({'id':row['id'],'note':row['note'],'expected':gold,'labelVersion':6,'provenance':'Original crowdsourced SNIPS wording, CC0. AI v6 development label; no independent human review. Not evaluation gold.'})
 mixture=json.loads((HERE/'train-reviewed-v6.json').read_text())+accepted
 normalized=[' '.join(r['note'].casefold().split()) for r in mixture]
 if len(set(normalized))!=len(normalized):raise ValueError('Duplicate mixture wording')
 for name,data in [('public-development-labels.json',labeled),('train-provisional-mixture-v6.json',mixture)]:
  with (HERE/name).open('x') as f:json.dump(data,f,indent=2,ensure_ascii=False);f.write('\n')
 print(json.dumps({'publicNominees':24,'provisionalPublicTraining':len(accepted),'quarantined':24-len(accepted),'provisionalMixture':len(mixture),'trainingExecuted':False}))
if __name__=='__main__':main()
