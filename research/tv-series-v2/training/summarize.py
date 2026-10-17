"""CPU-only paired counts. Incomplete/invalid inference never leaves denominators."""
import json
from pathlib import Path
from collections import Counter
from run import HERE, OUTPUT, read, sha

def summarize(parent, candidate, expected):
    expected_ids = [r['id'] for r in expected]
    if len(set(expected_ids)) != len(expected_ids): raise ValueError('Duplicate expected ID')
    if any([r['id'] for r in rows] != expected_ids for rows in [parent, candidate]):
        raise ValueError('Missing, duplicated or reordered predictions')
    for rows in [parent, candidate]:
        for prediction, case in zip(rows, expected):
            if prediction['gold'] != {k: case[k] for k in ['category','intent']}:
                raise ValueError('Gold changed')
    def scores(rows):
        n = len(rows)
        return {'total': n, 'invalid': sum(r['prediction'] is None for r in rows),
            'categoryCorrect': sum(bool(r['prediction']) and r['prediction']['category']==r['gold']['category'] for r in rows),
            'intentCorrect': sum(bool(r['prediction']) and r['prediction']['intent']==r['gold']['intent'] for r in rows),
            'jointCorrect': sum(r['prediction']==r['gold'] for r in rows),
            'perCategoryJoint': {cat: {'correct':sum(r['prediction']==r['gold'] for r in rows if r['gold']['category']==cat), 'total':sum(r['gold']['category']==cat for r in rows)} for cat in sorted({r['gold']['category'] for r in rows})}}
    result = {}
    for subset in ['series', 'retention']:
        p = [r for r in parent if r['subset']==subset]; c = [r for r in candidate if r['subset']==subset]
        gains = [a['id'] for a,b in zip(p,c) if a['prediction']!=a['gold'] and b['prediction']==b['gold']]
        losses = [a['id'] for a,b in zip(p,c) if a['prediction']==a['gold'] and b['prediction']!=b['gold']]
        majority = Counter((r['gold']['category'], r['gold']['intent']) for r in p).most_common(1)[0]
        result[subset] = {'parent':scores(p), 'candidate':scores(c), 'gains':gains, 'losses':losses, 'constantMajority':{'category':majority[0][0], 'intent':majority[0][1], 'correct':majority[1], 'total':len(p)}}
    clarifiers = [i for i,r in enumerate(parent) if r['subset']=='retention' and r['gold']['intent']=='clarify']
    result['legacyClarify'] = {'total':len(clarifiers),
        'parentCorrect':sum(parent[i]['prediction']==parent[i]['gold'] for i in clarifiers),
        'candidateCorrect':sum(candidate[i]['prediction']==candidate[i]['gold'] for i in clarifiers)}
    pc=result['retention']['parent']['perCategoryJoint'];cc=result['retention']['candidate']['perCategoryJoint']
    category_gate = all(cc[cat]['correct'] >= values['correct']-1 for cat,values in pc.items() if values['total']>=3)
    result['gates'] = {
      'seriesImproves':result['series']['candidate']['jointCorrect']>result['series']['parent']['jointCorrect'],
      'legacyOverallRetained':result['retention']['candidate']['jointCorrect']>=result['retention']['parent']['jointCorrect']-1,
      'clarifyRetained':result['legacyClarify']['candidateCorrect']>=result['legacyClarify']['parentCorrect'],
      'oldCategoriesRetained':category_gate}
    result['eligibleForFurtherQualification'] = all(result['gates'].values())
    result['productionPromoted'] = False
    return result

def main():
    expected = read('series-holdout.json')+read('retention.json')
    outputs = []
    for name in ['parent', 'candidate']:
        receipt = read(name+'-completed.json')
        path = HERE/(name+'-predictions.jsonl')
        if receipt['rows'] != len(expected) or receipt['outputSha256'] != sha(path): raise ValueError('Missing/changed completed inference')
        outputs.append([json.loads(line) for line in path.read_text().splitlines()])
    result = summarize(*outputs, expected)
    result['candidateAdapterSha256'] = sha(OUTPUT/'adapters.safetensors')
    result['training'] = json.loads((OUTPUT/'completed.json').read_text())
    result['limitations'] = ['32 AI-authored provisional series-focused holdout labels, not independent human gold.', '48 new AI-authored legacy-policy probes, not independently human-labeled.', 'Both models use the expanded prompt; no comparison to frontier models.', 'No app promotion; outcome cannot justify broad claims.', 'One predeclared training attempt; do not tune on these test outcomes.']
    (HERE/'results.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__ == '__main__': main()
