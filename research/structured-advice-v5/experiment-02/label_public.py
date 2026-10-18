"""Explicit pre-inference judgments; source labels are not passed to the model."""
import json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(ROOT/'scripts/app-mlx'))
from structured_advice_v5 import validate
# A None label records insufficient medium mapping; no accuracy credit is assigned.
LABELS=[
 None,('MUSIC','wishlist',['missing_identity']),('MUSIC','wishlist',['missing_identity']),None,None,None,None,
 ('MUSIC','wishlist',['missing_identity']),
 ('BOOK','reaction',['missing_identity']),None,None,('BOOK','reaction',['missing_identity']),None,
 ('BOOK','reaction',['missing_identity']),('BOOK','reaction',['missing_identity']),('BOOK','reaction',[]),
 *[('WISHLIST','wishlist',[]) for _ in range(8)],
]
def main():
 rows=json.loads((HERE/'public-nominations.json').read_text())
 assert len(rows)==len(LABELS)==24
 out=[]
 for row,label in zip(rows,LABELS):
  gold=validate(dict(zip(['category','intent','clarificationReasons'],label))) if label else None
  out.append({'id':row['id'],'note':row['note'],'expected':gold,'slice':'public','sourceIntent':row['sourceIntent'],
   'provenance':'Original crowdsourced SNIPS wording (CC0); OpenMemory gold authored by AI before inference, not independent human adjudication.',
   'labelStatus':'scored' if label else 'ambiguous-unscored-before-inference',
   'labelReason':'Literal requested action and medium are sufficiently explicit for the v5 policy.' if label else 'Medium absent or requested work type (essay/chronicle) outside the explicit v5 book/novel definition. Source intent/slots are unavailable to the classifier; do not force a gold label from them.'})
 with (HERE/'public-qualification.json').open('x') as f:json.dump(out,f,indent=2,ensure_ascii=False);f.write('\n')
 print(json.dumps({'nominated':len(out),'scored':sum(r['expected'] is not None for r in out),'unscored':sum(r['expected'] is None for r in out)}))
if __name__=='__main__':main()
