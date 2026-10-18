"""Research-only v6 advice validation. No note parsing, repairs, inference or activation."""
import json
from pathlib import Path
SPEC=json.loads(Path(__file__).with_name('classification_advice_v6.json').read_text())

def validate(value):
    if not isinstance(value,dict) or set(value)!={'category','intent','clarificationReasons'}:
        raise ValueError('Expected exactly category, intent, clarificationReasons')
    category,intent,reasons=value['category'],value['intent'],value['clarificationReasons']
    if not isinstance(category,str) or category not in SPEC['allowedIntents']:
        raise ValueError('Unknown category')
    if intent is not None and not isinstance(intent,str):
        raise ValueError('Invalid intent type')
    if intent not in SPEC['allowedIntents'][category]:
        raise ValueError('Intent is not allowed for this category')
    allowed=SPEC['schema']['properties']['clarificationReasons']['items']['enum']
    if not isinstance(reasons,list) or len(reasons)>3 or any(not isinstance(r,str) or r not in allowed for r in reasons) or len(reasons)!=len(set(reasons)):
        raise ValueError('Invalid clarification reasons')
    reasons=set(reasons)
    if category=='MIXED':
        # mixed is a routing decision, not a claim that all component actions are known.
        return value
    if category in {'PERSON','GOAL','IDEA'} and reasons:
        raise ValueError('Ordinary fact categories do not carry media clarification reasons')
    if category=='NOTE':
        expected=set() if intent=='none' else {'unresolved_reference'}
        if reasons!=expected:
            raise ValueError('NOTE uncertainty/future-reference requires unresolved_reference; none has no reasons')
    elif category=='WISHLIST':
        if reasons-{'unresolved_reference'}:
            raise ValueError('Nonmedia wishes do not require media identity or action clarification')
    else:
        if (intent is None)!=('missing_action' in reasons):
            raise ValueError('Unknown media action requires missing_action; known actions cannot carry it')
    return value

def semantic_key(value):
    value=validate(value)
    return value['category'],value['intent'],tuple(sorted(value['clarificationReasons']))
