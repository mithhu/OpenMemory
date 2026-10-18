"""Cross-check independent JSON Schema engine and Python validator; no model calls."""
import argparse,itertools,json,sys,importlib.metadata
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
def main():
 p=argparse.ArgumentParser();p.add_argument('--jsonschema-path',required=True);a=p.parse_args()
 sys.path.insert(0,a.jsonschema_path);sys.path.insert(0,str(ROOT/'scripts/app-mlx'))
 from jsonschema import Draft202012Validator
 from structured_advice_v6 import SPEC,validate
 Draft202012Validator.check_schema(SPEC['schema']);engine=Draft202012Validator(SPEC['schema'])
 cases=[]
 categories=list(SPEC['allowedIntents'])+['INVALID',None,42,[]]
 intents=SPEC['schema']['properties']['intent']['enum']+['invalid',False,[],{}]
 reasons=[list(x) for n in range(4) for x in itertools.combinations(['missing_identity','missing_action','unresolved_reference'],n)]
 reasons += [['missing_identity','missing_identity'],['unknown'],[None],None,'missing_identity',42]
 for c,a,r in itertools.product(categories,intents,reasons):cases.append({'category':c,'intent':a,'clarificationReasons':r})
 cases += [None,[],{}, {'category':'BOOK','intent':'reaction','clarificationReasons':[],'extra':True}]
 cases += [r['expected'] for r in json.loads((HERE/'train-provisional-mixture-v6.json').read_text())]
 for i,value in enumerate(cases):
  try:validate(value);accepted=True
  except ValueError:accepted=False
  if accepted!=engine.is_valid(value):raise AssertionError(f'Validator/schema disagreement at {i}: {value!r}')
 result={'cases':len(cases),'schemaDraft':'2020-12','jsonschemaVersion':importlib.metadata.version('jsonschema'),'disagreements':0,'modelCalls':0,'isAccuracyEvaluation':False}
 (HERE/'schema-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
