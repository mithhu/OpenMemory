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
    gold=json.loads((HERE/'qualification.json').read_text())
    for model,rows in data.items():
        if [r['id'] for r in rows]!=[r['id'] for r in gold]:raise ValueError('Incomplete or reordered evaluation')
        if any(r['gold']!=g['expected'] for r,g in zip(rows,gold)):raise ValueError('Gold changed')
    scores={m:report(rows) for m,rows in data.items()}
    train=json.loads((HERE/'train.json').read_text())
    majority=collections.Counter(key(r['expected']) for r in train).most_common(1)[0][0]
    baseline=sum(key(r['expected'])==majority for r in gold)
    parent=scores['parent'];candidate=scores['candidate'];base=scores['base']
    # Qualification IDs 004 and 013 are explicit season-only completion controls.
    season_ids={'v5-qualification-004','v5-qualification-013'}
    wrong_complete=[r['id'] for r in data['candidate'] if r['id'] in season_ids and isinstance(r.get('parsed'),dict) and r['parsed'].get('intent')=='complete']
    gates={
        'series_joint_improves_parent':candidate['slices']['series']['correct']>parent['slices']['series']['correct'],
        'retention_joint_not_below_parent':candidate['slices']['retention']['correct']>=parent['slices']['retention']['correct'],
        'uncertainty_not_below_parent':candidate['uncertainty']['correct']>=parent['uncertainty']['correct'],
        'joint_improves_base':candidate['components']['joint']['correct']>base['components']['joint']['correct'],
        'no_season_only_false_completion':not wrong_complete,
        'zero_invalid':candidate['schemaInvalid']==0,
    }
    return {'status':'qualification-only-no-automatic-promotion','sourceLimit':'48 AI-authored fictional notes with AI policy labels. Held out for this attempt, not independent human evaluation; no natural-language or pretraining independence claim.',
        'models':scores,'paired':{'baseToCandidate':compare(data['base'],data['candidate']),'parentToCandidate':compare(data['parent'],data['candidate'])},
        'trainMajorityJointBaseline':{'label':majority,'correct':baseline,'n':len(gold)},
        'gates':gates,'qualifiedForAppCompatibilityChecks':all(gates.values()),'installed':False,
        'interpretation':'All models evaluated raw under new v5 contract. Parent was trained on v3, so schema failures measure migration, not loss of its previously measured v3 ability. Only base-versus-candidate under identical v5 conditions tests adaptation value on this qualification set.'}
if __name__=='__main__':
    result=summarize()
    with (HERE/'results.json').open('x') as f:json.dump(result,f,indent=2);f.write('\n')
    print(json.dumps({k:result[k] for k in ['gates','qualifiedForAppCompatibilityChecks']}))
