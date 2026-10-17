"""Development-only structured contract. Never modifies or invokes a production model."""
import json
from pathlib import Path
SPEC = json.loads(Path(__file__).with_name('classification_advice_v5.json').read_text())

def validate(value):
    if not isinstance(value, dict) or set(value) != {'category', 'intent', 'clarificationReasons'}:
        raise ValueError('Expected exactly structured advice fields')
    props = SPEC['schema']['properties']
    if value['category'] not in props['category']['enum'] or value['intent'] not in props['intent']['enum']:
        raise ValueError('Unknown category or action')
    reasons = value['clarificationReasons']
    if not isinstance(reasons, list) or len(reasons)>3 or any(not isinstance(r,str) or r not in props['clarificationReasons']['items']['enum'] for r in reasons) or len(set(reasons))!=len(reasons):
        raise ValueError('Invalid clarification reasons')
    if (value['category']=='MIXED') != (value['intent']=='mixed'):
        raise ValueError('Mixed mismatch')
    if value['intent'] is None and not reasons:
        raise ValueError('Unknown action needs a clarification reason')
    if 'missing_action' in reasons and value['intent'] is not None:
        raise ValueError('An unknown action cannot also be known')
    return value

def semantic_key(value):
    value = validate(value)
    return value['category'],value['intent'],tuple(sorted(value['clarificationReasons']))
