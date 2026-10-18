"""Offline descriptive audit. Lexical counts are search aids, never runtime labels."""
import collections,hashlib,json,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
DATA=HERE.parent

def read(p):return json.loads(p.read_text())
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def lexical(rows):
 patterns={
  'rating_language':r'\b(?:rate|rating|ratings|stars|points|deserves)\b',
  'restaurant_language':r'\b(?:restaurant|restaurants|bistro|reservation|reservations|cuisine|pub)\b',
  'booking_table_language':r'\b(?:book\s+(?:me\s+)?a\s+(?:table|spot)|reservation|reservations)\b',
  'numeric_rating_fraction':r'\b\d+\s+(?:out\s+)?of\s+\d+\b',
  'first_person_I':r'\bi\b',
  'question_mark':r'\?',
  'explicit_please_or_could_or_can':r'\b(?:please|could|can)\b',
  'book_series_phrase':r'\bbook\s+series\b',
  'course_subunit_words':r'\b(?:lesson|lessons|lecture|lectures|module|modules)\b',
 }
 return {name:{'count':sum(bool(re.search(pattern,r['note'],re.I)) for r in rows),'ids':[r['id'] for r in rows if re.search(pattern,r['note'],re.I)]} for name,pattern in patterns.items()}

def group_counts(rows):
 return {'n':len(rows),'category':dict(collections.Counter(r['expected']['category'] for r in rows)),
  'intent':dict(collections.Counter('null' if r['expected']['intent'] is None else r['expected']['intent'] for r in rows)),
  'reasonSet':dict(collections.Counter('|'.join(sorted(r['expected']['clarificationReasons'])) or 'none' for r in rows)),
  'lexicalSearchAids':lexical(rows)}

def main():
 e1=DATA/'experiment-01';e2=DATA/'experiment-02'
 paths=[e1/'train.json',e2/'train.json',e2/'qualification.json',e2/'public-qualification.json',e2/'public-nominations.json',e2/'results.json',e2/'candidate-predictions.jsonl',e2/'contract.json',e2/'recipe.json']
 first=read(e1/'train.json');second=read(e2/'train.json');public=read(e2/'public-qualification.json')
 first_ids={r['id'] for r in first};repair=[r for r in second if r['id'] not in first_ids]
 synthetic=read(e2/'qualification.json');results=read(e2/'results.json')
 pred=[json.loads(line) for line in (e2/'candidate-predictions.jsonl').read_text().splitlines()]
 byid={r['id']:r for r in pred}
 ledger=read(HERE/'public-case-audit.json')
 assert {r['id'] for r in ledger}=={r['id'] for r in public} and len(ledger)==24
 public_byid={r['id']:r for r in public}
 for item in ledger:
  frozen=public_byid[item['id']]
  assert item['note']==frozen['note'] and item['frozenGold']==frozen['expected']
 public_counts={}
 for source in ['PlayMusic','RateBook','BookRestaurant']:
  subset=[r for r in public if r['sourceIntent']==source];scored=[r for r in subset if r['expected'] is not None]
  wrong=[r for r in scored if byid[r['id']]['prediction']!=r['expected']]
  def correct(field):
   return sum(isinstance(byid[r['id']]['parsed'],dict) and field in byid[r['id']]['parsed'] and byid[r['id']]['parsed'][field]==r['expected'][field] for r in scored)
  public_counts[source]={'nominated':len(subset),'scored':len(scored),'unscored':len(subset)-len(scored),'jointCorrect':len(scored)-len(wrong),'categoryCorrect':correct('category'),'intentCorrect':correct('intent'),'failureIds':[r['id'] for r in wrong]}
 reason_errors=[]
 for r in public:
  x=byid[r['id']]
  if r['expected'] is not None and isinstance(x['parsed'],dict) and x['parsed'].get('category')==r['expected']['category'] and x['parsed'].get('intent')==r['expected']['intent'] and (sorted(x['parsed'].get('clarificationReasons',[]))!=sorted(r['expected']['clarificationReasons']) or x['prediction'] is None):reason_errors.append(r['id'])
 result={'status':'post-result-descriptive-audit-no-training-no-relabeling',
  'inputHashes':{str(p.relative_to(ROOT)):digest(p) for p in paths},
  'trainingBeforeRepair':group_counts(first),'repairOnly':group_counts(repair),'trainingAfterRepair':group_counts(second),
  'syntheticQualification':group_counts(synthetic),'publicAll':{'n':24,'lexicalSearchAids':lexical(public)},
  'publicCoverageBySource':public_counts,'publicCorrectCategoryAndIntentButWrongReasonsOrContract':reason_errors,
  'frozenScoresRetained':{m:{'syntheticJoint':r['synthetic']['components']['joint'],'publicScoredJoint':r['publicScored']['components']['joint'],'publicCategory':r['publicScored']['components']['category']} for m,r in results['models'].items()},
  'limitations':['Lexical searches are descriptive and cannot establish semantic coverage or author style. Counts are not classification rules.','The v5 mixture is 100% AI-authored fictional text. Human public wording is evaluation-only; its task labels are AI judgments.','No source author/worker/conversation IDs are available for stronger independence guarantees in the retained SNIPS sample.','Audit is performed after predictions; no audited example may be called a fresh final test.','Historical labels and predictions are unchanged. Policy concerns are prospective, not retrospective score repairs.']}
 (HERE/'audit-results.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'trainingCounts':{name:x['count'] for name,x in result['trainingAfterRepair']['lexicalSearchAids'].items()},'repairCounts':{name:x['count'] for name,x in result['repairOnly']['lexicalSearchAids'].items()},'sourceCoverage':public_counts,'reasonOnlyFailures':len(reason_errors)},indent=2))
if __name__=='__main__':main()
