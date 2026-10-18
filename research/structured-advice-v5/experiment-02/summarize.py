"""Frozen v5 qualification metrics; raw invalid responses are never repaired."""
import collections, json, math, statistics
from pathlib import Path
HERE=Path(__file__).resolve().parent

def key(v):
    if v is None:return None
    return v['category'],v['intent'],tuple(sorted(v['clarificationReasons']))
def wilson(k,n):
    if not n:return None
    z=1.96;p=k/n;den=1+z*z/n
    center=(p+z*z/(2*n))/den
    half=z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den
    return [round(center-half,4),round(center+half,4)]
def metric(rows, component='joint'):
    def correct(r):
        if component=='joint':return key(r['prediction'])==key(r['gold'])
        if component=='clarificationReasons':
            return r['prediction'] is not None and sorted(r['prediction'][component])==sorted(r['gold'][component])
        parsed=r.get('parsed')
        return isinstance(parsed,dict) and component in parsed and parsed[component]==r['gold'][component]
    k=sum(correct(r) for r in rows);n=len(rows)
    return {'correct':k,'n':n,'accuracy':k/n if n else None,'wilson95':wilson(k,n)}
def report(rows):
    lat=[r['latencySeconds'] for r in rows]
    return {'components':{c:metric(rows,c) for c in ['category','intent','clarificationReasons','joint']},
        'schemaInvalid':sum(r['prediction'] is None for r in rows),
        'slices':{s:metric([r for r in rows if r['subset']==s]) for s in ['series','retention']},
        'uncertainty':metric([r for r in rows if r['gold']['clarificationReasons']]),
        'perCategory':{c:metric([r for r in rows if r['gold']['category']==c]) for c in sorted(set(r['gold']['category'] for r in rows))},
        'firstRequestSeconds':lat[0], 'warmMedianSeconds':statistics.median(lat[1:]),
        'warmP95Seconds':sorted(lat[1:])[math.ceil(.95*len(lat[1:]))-1]}
def compare(a,b):
    aa={r['id']:r for r in a};bb={r['id']:r for r in b}
    if aa.keys()!=bb.keys():raise ValueError('Paired IDs differ')
    gains=[];losses=[]
    for id in aa:
        old=key(aa[id]['prediction'])==key(aa[id]['gold']);new=key(bb[id]['prediction'])==key(bb[id]['gold'])
        if new and not old:gains.append(id)
        if old and not new:losses.append(id)
    return {'gains':gains,'losses':losses,'net':len(gains)-len(losses)}
def summarize():
    data={m:[json.loads(l) for l in (HERE/(m+'-predictions.jsonl')).read_text().splitlines()] for m in ['base','parent','candidate']}
    gold=json.loads((HERE/'qualification.json').read_text())+json.loads((HERE/'public-qualification.json').read_text())
    for model,rows in data.items():
        if [r['id'] for r in rows]!=[r['id'] for r in gold]:raise ValueError('Incomplete or reordered evaluation')
        if any(r['gold']!=g['expected'] for r,g in zip(rows,gold)):raise ValueError('Gold changed')
    synthetic={m:[r for r in rows if r['subset']!='public'] for m,rows in data.items()}
    public={m:[r for r in rows if r['subset']=='public' and r['gold'] is not None] for m,rows in data.items()}
    scores={m:{'synthetic':report(synthetic[m]),'publicScored':report(public[m]),'allOutputContractInvalid':sum(r['prediction'] is None for r in rows),
        'publicAllRows':sum(r['subset']=='public' for r in rows),'publicUnscored':sum(r['subset']=='public' and r['gold'] is None for r in rows)} for m,rows in data.items()}
    parent=scores['parent']['synthetic'];candidate=scores['candidate']['synthetic'];base=scores['base']['synthetic']
    false_completion=[r['id'] for r in data['candidate'] if r['gold'] and r['gold']['category'] in ['SERIES','LESSON'] and r['gold']['intent']=='progress' and isinstance(r.get('parsed'),dict) and r['parsed'].get('intent')=='complete']
    gates={
        'synthetic_joint_not_below_previous_candidate':candidate['components']['joint']['correct']>=parent['components']['joint']['correct'],
        'synthetic_joint_improves_base':candidate['components']['joint']['correct']>base['components']['joint']['correct'],
        'series_joint_not_below_previous_candidate':candidate['slices']['series']['correct']>=parent['slices']['series']['correct'],
        'uncertainty_not_below_previous_candidate':candidate['uncertainty']['correct']>=parent['uncertainty']['correct'],
        'public_scored_joint_not_below_previous_candidate':scores['candidate']['publicScored']['components']['joint']['correct']>=scores['parent']['publicScored']['components']['joint']['correct'],
        'no_partial_course_or_series_false_completion':not false_completion,
        'zero_contract_invalid_all_72':scores['candidate']['allOutputContractInvalid']==0,
    }
    train=json.loads((HERE/'train.json').read_text())
    baselines={}
    for field in ['category','intent','clarificationReasons','joint']:
        def field_key(value):
            if field=='joint':return key(value)
            if field=='clarificationReasons':return tuple(sorted(value[field]))
            return value[field]
        majority=collections.Counter(field_key(r['expected']) for r in train).most_common(1)[0][0]
        baselines[field]={'trainMajority':majority,'syntheticCorrect':sum(field_key(r['expected'])==majority for r in gold if r['slice']!='public'),
            'publicScoredCorrect':sum(field_key(r['expected'])==majority for r in gold if r['slice']=='public' and r['expected'] is not None)}
    return {'status':'one-bounded-repair-attempt-no-automatic-promotion','parentMeaning':'Parent is previous rejected v5 experiment-01 candidate, not the installed reviewed730 adapter.',
        'sourceLimit':'48 new AI-authored fictional qualification notes; 24 original crowdsourced SNIPS queries, 16 scored and 8 predeclared ambiguous/unscored. Public wording is human-authored but OpenMemory labels are same-author AI judgments; SNIPS appeared in older project work and is not a globally unseen source.',
        'models':scores,'paired':{group:{'baseToCandidate':compare(parts['base'],parts['candidate']),'previousToCandidate':compare(parts['parent'],parts['candidate'])} for group,parts in [('synthetic',synthetic),('publicScored',public)]},
        'baselines':baselines,'falseCompletionIds':false_completion,'gates':gates,'qualifiedForAppCompatibilityChecks':all(gates.values()),'installed':False,
        'interpretation':'Same v5 contract for all three models. No pooling synthetic and public accuracy, no scoring ambiguous rows, no inference from hidden source slots, no JSON repair or post-prediction label changes. Wilson intervals are descriptive for selected notes, not representative population inference.'}
if __name__=='__main__':
    result=summarize()
    with (HERE/'results.json').open('x') as f:json.dump(result,f,indent=2);f.write('\n')
    print(json.dumps({k:result[k] for k in ['gates','qualifiedForAppCompatibilityChecks']}))
