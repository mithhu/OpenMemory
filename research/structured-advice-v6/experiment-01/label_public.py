"""Explicit pre-prediction labels from visible original wording, not source classes."""
import json,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[2]/'scripts/app-mlx'))
from structured_advice_v6 import validate
# None stays unscored: the visible wording does not establish a medium.
JUDGMENTS=[
 (None,'Series could be books or television; no catalog lookup or source-class inference.'),
 (None,'Unqualified series has no explicit medium.'),
 (('BOOK','reaction',['missing_identity']),'Current book explicitly rated zero; identity unspecified, no completion evidence.'),
 (None,'A named work is rated but no medium is stated.'),
 (('BOOK','reaction',['missing_identity']),'Textbook is a book, rating request is reaction, specific title absent.'),
 (None,'Saga alone does not establish book versus other medium.'),
 (('MUSIC','reaction',['missing_identity']),'Current album is an unnamed musical work and receives a zero-star reaction.'),
 (('MUSIC','reaction',['missing_identity']),'Album rating is reaction, not listening or progress; identity unspecified.'),
 *[(('WISHLIST','wishlist',[]),'Visible table/booking/dining request, including fragments and typos; no media identity required.') for _ in range(8)],
 (None,'Play plus a personal name lacks explicit music/game/other medium; hidden artist slot is not evidence.'),
 *[(('MUSIC','wishlist',[]),'Explicit prospective music/track/tunes/melody request; no specific unnamed work requiring identity resolution.') for _ in range(7)],
]
def main():
 rows=json.loads((HERE/'public-nominations.json').read_text());assert len(rows)==len(JUDGMENTS)==24
 out=[]
 for r,(label,reason) in zip(rows,JUDGMENTS):
  gold=validate(dict(zip(['category','intent','clarificationReasons'],label))) if label else None
  out.append({**r,'expected':gold,'slice':'public','labelRationale':reason,'labelProvenance':'AI task judgment on original crowdsourced wording; not independent human gold.','scored':bool(gold)})
 with (HERE/'public-qualification.json').open('x') as f:json.dump(out,f,indent=2,ensure_ascii=False);f.write('\n')
 print(json.dumps({'nominated':24,'scored':sum(r['scored'] for r in out),'unscored':sum(not r['scored'] for r in out)}))
if __name__=='__main__':main()
