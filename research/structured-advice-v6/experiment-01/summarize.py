"""Strict paired v6 qualification. Frozen gold, raw outputs, no repairs or pooling."""
import json,sys,collections,statistics,math
from pathlib import Path
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE.parents[2]/'scripts/app-mlx'))
from structured_advice_v6 import validate,semantic_key
MODELS=['base','installed','parent','candidate']
def key(value):
 if value is None:return None
 return semantic_key(value)
def correct(row):return row['gold'] is not None and key(row['prediction'])==key(row['gold'])
def metric(rows):
 rows=[r for r in rows if r['gold'] is not None];n=len(rows);k=sum(correct(r) for r in rows)
 # Descriptive interval only; selected examples are not representative sampling.
 if n:
  z=1.96;p=k/n;d=1+z*z/n;c=(p+z*z/(2*n))/d;h=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
  interval=[c-h,c+h]
 else:interval=None
 return {'correct':k,'n':n,'accuracy':k/n if n else None,'wilson95':interval}
def report(rows):
 scored=[r for r in rows if r['gold'] is not None]
 return {'joint':metric(scored),'invalidAll':sum(r['prediction'] is None for r in rows),'unscored':len(rows)-len(scored),
  'components':{field:{'correct':sum(isinstance(r.get('parsed'),dict) and r['parsed'].get(field)==r['gold'][field] for r in scored),'n':len(scored)} for field in ['category','intent']},
  'byCategory':{c:metric([r for r in scored if r['gold']['category']==c]) for c in sorted({r['gold']['category'] for r in scored})},
  'uncertainty':metric([r for r in scored if r['gold']['clarificationReasons']]),
  'medianSeconds':statistics.median(r['latencySeconds'] for r in rows)}
def paired(old,new):
 if [r['id'] for r in old]!=[r['id'] for r in new]:raise ValueError('Unpaired evaluation')
 return {'gains':[a['id'] for a,b in zip(old,new) if not correct(a) and correct(b)],'losses':[a['id'] for a,b in zip(old,new) if correct(a) and not correct(b)]}
def summarize(data):
 gold=json.loads((HERE/'qualification.json').read_text())+json.loads((HERE/'public-qualification.json').read_text())
 for model,rows in data.items():
  if [r['id'] for r in rows]!=[r['id'] for r in gold] or any(r['gold']!=g['expected'] for r,g in zip(rows,gold)):raise ValueError('Incomplete/reordered evaluation or altered gold: '+model)
  for r in rows:
   if r['prediction'] is not None:validate(r['prediction'])
 synthetic={m:[r for r in rows if r['subset']!='public'] for m,rows in data.items()}
 public={m:[r for r in rows if r['subset']=='public'] for m,rows in data.items()}
 scores={m:{'synthetic':report(synthetic[m]),'public':report(public[m]),'invalidAll':sum(r['prediction'] is None for r in data[m])} for m in MODELS}
 cand=scores['candidate'];prev=scores['parent'];base=scores['base'];installed=scores['installed']
 false_complete=[r['id'] for r in data['candidate'] if r['gold'] and r['gold']['category'] in ['SERIES','LESSON'] and r['gold']['intent']=='progress' and isinstance(r.get('parsed'),dict) and r['parsed'].get('intent')=='complete']
 retained=['MOVIE','BOOK','LESSON']
 gates={
  'synthetic_joint_improves_base':cand['synthetic']['joint']['correct']>base['synthetic']['joint']['correct'],
  'synthetic_joint_not_below_previous_research_candidate':cand['synthetic']['joint']['correct']>=prev['synthetic']['joint']['correct'],
  'synthetic_joint_not_below_installed_adapter_transfer_probe':cand['synthetic']['joint']['correct']>=installed['synthetic']['joint']['correct'],
  'series_improves_installed_and_not_below_previous':cand['synthetic']['byCategory']['SERIES']['correct']>installed['synthetic']['byCategory']['SERIES']['correct'] and cand['synthetic']['byCategory']['SERIES']['correct']>=prev['synthetic']['byCategory']['SERIES']['correct'],
  'movie_book_lesson_joint_no_regression_vs_previous':all(cand['synthetic']['byCategory'][c]['correct']>=prev['synthetic']['byCategory'][c]['correct'] for c in retained),
  'uncertainty_joint_no_regression_vs_previous':cand['synthetic']['uncertainty']['correct']>=prev['synthetic']['uncertainty']['correct'],
  'public_joint_no_regression_vs_base_and_previous':cand['public']['joint']['correct']>=max(base['public']['joint']['correct'],prev['public']['joint']['correct']),
  'no_partial_series_or_course_false_completion':not false_complete,
  'zero_contract_invalid_including_unscored':cand['invalidAll']==0,
 }
 return {'models':scores,'gates':gates,'qualifiedForAppCompatibilityChecks':all(gates.values()),'installed':False,
  'falseCompletionIds':false_complete,'paired':{kind:{m:paired(parts[m],parts['candidate']) for m in ['base','installed','parent']} for kind,parts in [('synthetic',synthetic),('publicScored',{m:[r for r in rows if r['gold'] is not None] for m,rows in public.items()})]},
  'protocol':'All four checkpoints receive identical v6 instructions and unconstrained greedy decoding. Installed reviewed730 was trained for a two-field contract and lacks SERIES; this is a new-prompt transfer probe, NOT its production pipeline benchmark. Parent is rejected v5 experiment-02, not installed. No output coercion or label remapping.',
  'dataLimits':'48 AI-authored qualification notes; 24 exact-original crowdsourced SNIPS queries, 19 scored and 5 predeclared unscored. AI task labels, not independently human-adjudicated gold. SNIPS used earlier; exact expression/ID exclusion does not establish global source-family or pretraining independence. Public and authored scores reported separately.'}
if __name__=='__main__':
 data={m:[json.loads(s) for s in (HERE/(m+'-predictions.jsonl')).read_text().splitlines()] for m in MODELS}
 result=summarize(data)
 with (HERE/'results.json').open('x') as f:json.dump(result,f,indent=2);f.write('\n')
 print(json.dumps({'gates':result['gates'],'qualifiedForAppCompatibilityChecks':result['qualifiedForAppCompatibilityChecks']}))
